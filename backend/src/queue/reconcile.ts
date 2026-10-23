import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { emails } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { windowOf } from '../lib/time.js';
import { emailQueue, enqueueEmails } from './emailQueue.js';

const BATCH = 500;

/**
 * Runs when a worker starts. BullMQ jobs already live in Redis (AOF persisted), so normally there
 * is nothing to do. This covers the gaps: Redis lost data, or the API saved emails but crashed
 * before enqueueing them. Every `scheduled` row without a job gets one again, keeping its original
 * scheduled time; job ids are email ids, so this can never create a duplicate.
 */
export async function reconcileScheduledEmails(): Promise<{ checked: number; recovered: number }> {
  let checked = 0;
  let recovered = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await db
      .select({ id: emails.id, scheduledAt: emails.scheduledAt })
      .from(emails)
      .where(cursor ? and(eq(emails.status, 'scheduled'), gt(emails.id, cursor)) : eq(emails.status, 'scheduled'))
      .orderBy(asc(emails.id))
      .limit(BATCH);
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;
    checked += batch.length;

    const jobs = await Promise.all(batch.map((e) => emailQueue.getJob(e.id)));
    const missing = batch.filter((_, i) => !jobs[i]);
    if (missing.length > 0) {
      await enqueueEmails(
        missing.map((e) => ({ emailId: e.id, scheduledAt: e.scheduledAt, reservedWindow: windowOf(e.scheduledAt.getTime()) })),
      );
      recovered += missing.length;
    }
  }

  // Rows left in `sending` with no job: the send was interrupted and Redis lost the job.
  // Same rule as the processor: mark failed rather than risk a duplicate.
  const stuck = await db.select({ id: emails.id }).from(emails).where(eq(emails.status, 'sending'));
  let interrupted = 0;
  for (const row of stuck) {
    if (await emailQueue.getJob(row.id)) continue;
    await db
      .update(emails)
      .set({ status: 'failed', failedAt: new Date(), error: 'Interrupted while sending; not retried to avoid a duplicate send' })
      .where(and(eq(emails.id, row.id), eq(emails.status, 'sending')));
    interrupted++;
  }

  logger.info({ checked, recovered, interrupted }, 'Startup reconciliation finished');
  return { checked, recovered };
}
