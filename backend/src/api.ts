import { env } from './config/env.js';
import { createApp, QUEUE_DASHBOARD_PATH } from './app.js';
import { runMigrations } from './db/migrate.js';
import { pool } from './db/client.js';
import { logger } from './lib/logger.js';
import { redis } from './lib/redis.js';
import { ensureSearchIndex } from './lib/search.js';
import { ensureSenders } from './modules/senders/service.js';
import { emailQueue } from './queue/emailQueue.js';

async function main() {
  await runMigrations();
  const senderList = await ensureSenders();
  logger.info({ senders: senderList.map((s) => s.email) }, 'Sender mailboxes ready');
  await ensureSearchIndex();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (queue dashboard: ${QUEUE_DASHBOARD_PATH})`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down API');
    server.close();
    await emailQueue.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal(err, 'API failed to start');
  process.exit(1);
});
