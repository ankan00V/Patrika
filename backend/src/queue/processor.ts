import { DelayedError, type Job } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { attachments, campaigns, emails, senders, type Sender } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { updateEmailDocument } from '../lib/search.js';
import { windowOf, windowStart } from '../lib/time.js';
import { sendEmail } from '../modules/senders/mailer.js';
import { listSenders } from '../modules/senders/service.js';
import type { EmailJobData } from './emailQueue.js';
import { rateLimiter } from './limiter.js';
import { notifyLimitReached } from './notifications.js';

interface ProcessorData extends EmailJobData {
  /** Set right after SMTP accepted the message, before Postgres is updated (crash safety). */
  sentMessageId?: string;
  sentPreviewUrl?: string | null;
}

export type JobOutcome =
  | { outcome: 'sent'; messageId: string; previewUrl: string | null }
  | { outcome: 'skipped'; reason: string };

/**
 * Sends one email. Safe to run with any concurrency and on any number of worker processes:
 *  1. Postgres status is the idempotency guard — only a row still `scheduled` can be claimed,
 *     with a conditional UPDATE, so two workers can never both send it.
 *  2. The hourly limit was reserved when the campaign was planned. If the job runs in a
 *     different hour (it is late, e.g. the worker was down), a new slot is reserved; when the
 *     current hour is full the job is moved to the next free hour instead of failing.
 */
export async function processEmailJob(job: Job<ProcessorData>, token?: string): Promise<JobOutcome> {
  const [row] = await db
    .select({ email: emails, campaign: campaigns, sender: senders })
    .from(emails)
    .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
    .innerJoin(senders, eq(senders.id, emails.senderId))
    .where(eq(emails.id, job.data.emailId));
  if (!row) return { outcome: 'skipped', reason: 'email no longer exists' };

  const { email, campaign } = row;
  let sender: Sender = row.sender;

  if (email.status === 'sent' || email.status === 'failed') {
    return { outcome: 'skipped', reason: `already ${email.status}` };
  }

  if (email.status === 'sending') {
    if (job.data.sentMessageId) {
      // SMTP accepted it but the process died before Postgres was updated: finish the bookkeeping.
      await markSent(email.id, job.data.sentMessageId, job.data.sentPreviewUrl ?? null);
      return { outcome: 'sent', messageId: job.data.sentMessageId, previewUrl: job.data.sentPreviewUrl ?? null };
    }
    // Died mid-send: we can't know whether the provider accepted it. At-most-once wins over a duplicate.
    const error = 'Interrupted while sending; not retried to avoid a duplicate send';
    await db.update(emails).set({ status: 'failed', failedAt: new Date(), error }).where(eq(emails.id, email.id));
    await updateEmailDocument(email.id, { status: 'failed' });
    return { outcome: 'skipped', reason: error };
  }

  // --- hourly limit ---------------------------------------------------------------------------
  const nowWindow = windowOf(Date.now());
  let window = job.data.reservedWindow;
  if (window !== nowWindow) {
    const senderList = await listSenders();
    const reservation = await rateLimiter.reserve({
      notBefore: Date.now(),
      campaignId: campaign.id,
      campaignLimit: campaign.hourlyLimit,
      senderLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
      senderIds: senderList.map((s) => s.id),
      rotation: email.seq,
    });
    window = reservation.window;
    await job.updateData({ ...job.data, reservedWindow: window });

    if (reservation.senderId !== sender.id) {
      sender = senderList.find((s) => s.id === reservation.senderId)!;
      await db.update(emails).set({ senderId: sender.id }).where(eq(emails.id, email.id));
    }

    if (window !== nowWindow) {
      // Current hour is full: defer to the next free hour. The seq offset keeps campaign order.
      const runAt = windowStart(window) + (email.seq % 1000);
      await db
        .update(emails)
        .set({ scheduledAt: new Date(runAt), deferrals: sql`${emails.deferrals} + 1` })
        .where(eq(emails.id, email.id));
      await updateEmailDocument(email.id, { scheduledAt: new Date(runAt).toISOString(), senderId: sender.id });
      logger.info({ emailId: email.id, runAt: new Date(runAt).toISOString() }, 'Hourly limit full; email deferred');
      await job.moveToDelayed(runAt, token);
      throw new DelayedError();
    }
  }

  // --- claim (idempotency guard) ----------------------------------------------------------------
  const [claimed] = await db
    .update(emails)
    .set({ status: 'sending', attempts: sql`${emails.attempts} + 1` })
    .where(and(eq(emails.id, email.id), eq(emails.status, 'scheduled')))
    .returning({ id: emails.id });
  if (!claimed) return { outcome: 'skipped', reason: 'claimed by another worker' };

  // --- send -------------------------------------------------------------------------------------
  let result: { messageId: string; previewUrl: string | null };
  try {
    result = await sendEmail(sender, {
      emailId: email.id,
      to: email.recipient,
      subject: campaign.subject,
      html: campaign.body,
      text: campaign.bodyText,
      attachments: await campaignAttachments(campaign.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await db
      .update(emails)
      .set(finalAttempt ? { status: 'failed', failedAt: new Date(), error: message } : { status: 'scheduled', error: message })
      .where(eq(emails.id, email.id));
    if (finalAttempt) await updateEmailDocument(email.id, { status: 'failed' });
    throw err;
  }

  await job.updateData({ ...job.data, reservedWindow: window, sentMessageId: result.messageId, sentPreviewUrl: result.previewUrl });
  await markSent(email.id, result.messageId, result.previewUrl);

  const reached = await rateLimiter.recordSent({
    window,
    senderId: sender.id,
    senderLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    campaignId: campaign.id,
    campaignLimit: campaign.hourlyLimit,
  });
  if (reached.senderLimitReached || reached.campaignLimitReached) {
    notifyLimitReached({
      userId: email.userId,
      window,
      sender: reached.senderLimitReached ? { email: sender.email, limit: env.MAX_EMAILS_PER_HOUR_PER_SENDER } : undefined,
      campaign: reached.campaignLimitReached ? { subject: campaign.subject, limit: campaign.hourlyLimit } : undefined,
    });
  }

  return { outcome: 'sent', ...result };
}

/** Attachments are shared by every email of a campaign, so keep a few campaigns' files decoded. */
const attachmentCache = new Map<string, { filename: string; contentType: string; content: Buffer }[]>();

async function campaignAttachments(campaignId: string) {
  const cached = attachmentCache.get(campaignId);
  if (cached) return cached;
  const rows = await db.select().from(attachments).where(eq(attachments.campaignId, campaignId));
  const files = rows.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    content: Buffer.from(a.contentBase64, 'base64'),
  }));
  attachmentCache.set(campaignId, files);
  if (attachmentCache.size > 20) attachmentCache.delete(attachmentCache.keys().next().value!);
  return files;
}

async function markSent(emailId: string, messageId: string, previewUrl: string | null) {
  const sentAt = new Date();
  await db
    .update(emails)
    .set({ status: 'sent', sentAt, messageId, previewUrl, error: null })
    .where(eq(emails.id, emailId));
  await updateEmailDocument(emailId, { status: 'sent', sentAt: sentAt.toISOString() });
}
