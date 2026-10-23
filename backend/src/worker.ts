import { Worker } from 'bullmq';
import { env } from './config/env.js';
import { pool } from './db/client.js';
import { logger } from './lib/logger.js';
import { createRedis, redis } from './lib/redis.js';
import { closeTransports } from './modules/senders/mailer.js';
import { emailQueue } from './queue/emailQueue.js';
import { processEmailJob } from './queue/processor.js';
import { reconcileScheduledEmails } from './queue/reconcile.js';

async function main() {
  await reconcileScheduledEmails();

  const worker = new Worker(env.EMAIL_QUEUE_NAME, processEmailJob, {
    connection: createRedis(),
    concurrency: env.WORKER_CONCURRENCY,
    // Global throttle, stored in Redis and shared by every worker process:
    // at most one send per MIN_DELAY_BETWEEN_SENDS_MS across the whole queue.
    limiter: env.MIN_DELAY_BETWEEN_SENDS_MS > 0 ? { max: 1, duration: env.MIN_DELAY_BETWEEN_SENDS_MS } : undefined,
  });

  worker.on('completed', (job, result) => logger.info({ jobId: job.id, ...result }, 'Job completed'));
  worker.on('failed', (job, err) =>
    logger.warn({ jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, 'Job attempt failed'),
  );
  worker.on('error', (err) => logger.error({ err }, 'Worker error'));

  logger.info(
    {
      concurrency: env.WORKER_CONCURRENCY,
      minDelayBetweenSendsMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
      maxEmailsPerHourPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    },
    'Email worker started',
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down worker (waiting for in-flight sends)');
    await worker.close(); // lets active jobs finish; delayed jobs stay in Redis
    await emailQueue.close();
    closeTransports();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal(err, 'Worker failed to start');
  process.exit(1);
});
