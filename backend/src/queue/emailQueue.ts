import { Queue, type JobsOptions } from 'bullmq';
import { env } from '../config/env.js';
import { createRedis } from '../lib/redis.js';

export interface EmailJobData {
  emailId: string;
  /** Hour window whose rate-limit slot was reserved for this email when it was planned. */
  reservedWindow: number;
}

export const emailQueue = new Queue<EmailJobData>(env.EMAIL_QUEUE_NAME, { connection: createRedis() });

export const emailJobOptions = (delayMs: number): JobsOptions => ({
  delay: Math.max(0, delayMs),
  attempts: env.SEND_ATTEMPTS,
  backoff: { type: 'exponential', delay: 30_000 },
  // Keep history bounded; Postgres is the long-term record.
  removeOnComplete: { age: 7 * 24 * 3600, count: 50_000 },
  removeOnFail: { age: 30 * 24 * 3600 },
});

/**
 * One delayed job per email. The job id is the email's primary key, so adding the same email twice
 * (double submit, restart reconciliation) is a no-op in BullMQ instead of a duplicate send.
 */
export async function enqueueEmails(items: { emailId: string; scheduledAt: Date; reservedWindow: number }[]) {
  const now = Date.now();
  const CHUNK = 500;
  for (let i = 0; i < items.length; i += CHUNK) {
    await emailQueue.addBulk(
      items.slice(i, i + CHUNK).map((item) => ({
        name: 'send-email',
        data: { emailId: item.emailId, reservedWindow: item.reservedWindow },
        opts: { ...emailJobOptions(item.scheduledAt.getTime() - now), jobId: item.emailId },
      })),
    );
  }
}
