import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { attachments, campaigns, emails, type User } from '../../db/schema.js';
import { normalizeBody } from '../../lib/html.js';
import { HttpError } from '../../http/errors.js';
import { logger } from '../../lib/logger.js';
import { indexEmails, toDocument } from '../../lib/search.js';
import { enqueueEmails } from '../../queue/emailQueue.js';
import { rateLimiter } from '../../queue/limiter.js';
import type { Reservation } from '../../queue/rateLimiter.js';
import { listSenders } from '../senders/service.js';
import { planSchedule } from './planner.js';

export const MAX_RECIPIENTS = 10_000;
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const attachmentSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/, 'Invalid content type').max(100),
  contentBase64: z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'Attachment must be base64'),
});

const decodedSize = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

export const createCampaignSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  body: z.string().trim().min(1, 'Body is required').max(200_000),
  /** Optional sender mailbox; omitted = rotate across all mailboxes. */
  senderId: z.string().uuid().optional(),
  attachments: z
    .array(attachmentSchema)
    .max(MAX_ATTACHMENTS, `At most ${MAX_ATTACHMENTS} attachments`)
    .default([])
    .refine(
      (files) => files.reduce((sum, f) => sum + decodedSize(f.contentBase64), 0) <= MAX_ATTACHMENT_BYTES,
      `Attachments can be at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB in total`,
    ),
  recipients: z
    .array(z.string().trim().toLowerCase().email())
    .min(1, 'Add at least one recipient')
    .max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} recipients per campaign`),
  startAt: z.coerce.date(),
  delayBetweenSeconds: z.coerce.number().int().min(0).max(3600),
  hourlyLimit: z.coerce.number().int().min(1).max(env.MAX_CAMPAIGN_HOURLY_LIMIT),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export async function createCampaign(user: User, input: CreateCampaignInput) {
  const existing = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.userId, user.id), eq(campaigns.idempotencyKey, input.idempotencyKey)),
  });
  if (existing) return { campaign: existing, duplicate: true as const };

  const allSenders = await listSenders();
  if (allSenders.length === 0) throw new HttpError(503, 'No sender mailboxes are configured yet');
  const senderById = new Map(allSenders.map((s) => [s.id, s]));
  if (input.senderId && !senderById.has(input.senderId)) throw new HttpError(400, 'Unknown sender mailbox');
  const senderList = input.senderId ? [senderById.get(input.senderId)!] : allSenders;
  const body = normalizeBody(input.body);
  if (!body.text) throw new HttpError(400, 'Body is required');

  const recipients = [...new Set(input.recipients)];
  const now = Date.now();
  const startAt = Math.max(input.startAt.getTime(), now);
  if (startAt - now > 365 * 24 * 3600 * 1000) throw new HttpError(400, 'Start time must be within a year');

  const campaignId = crypto.randomUUID();
  const reservations: Reservation[] = [];
  const plan = await planSchedule({
    recipients,
    startAt,
    delayBetweenMs: input.delayBetweenSeconds * 1000,
    reserve: async (notBefore, seq) => {
      const r = await rateLimiter.reserve({
        notBefore,
        campaignId,
        campaignLimit: input.hourlyLimit,
        senderLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
        senderIds: senderList.map((s) => s.id),
        rotation: seq,
      });
      reservations.push(r);
      return r;
    },
  });

  let created;
  try {
    created = await db.transaction(async (tx) => {
      const [campaign] = await tx
        .insert(campaigns)
        .values({
          id: campaignId,
          userId: user.id,
          idempotencyKey: input.idempotencyKey,
          subject: input.subject,
          body: body.html,
          bodyText: body.text,
          senderId: input.senderId ?? null,
          startAt: new Date(startAt),
          delayBetweenMs: input.delayBetweenSeconds * 1000,
          hourlyLimit: input.hourlyLimit,
          totalEmails: plan.length,
        })
        .onConflictDoNothing()
        .returning();
      if (!campaign) return null; // a concurrent request with the same key won the race

      if (input.attachments.length > 0) {
        await tx.insert(attachments).values(
          input.attachments.map((a) => ({
            campaignId,
            filename: a.filename,
            contentType: a.contentType,
            size: decodedSize(a.contentBase64),
            contentBase64: a.contentBase64,
          })),
        );
      }

      const rows = [];
      for (let i = 0; i < plan.length; i += 1000) {
        const chunk = plan.slice(i, i + 1000).map((p) => ({
          campaignId,
          userId: user.id,
          senderId: p.senderId,
          recipient: p.recipient,
          seq: p.seq,
          scheduledAt: p.scheduledAt,
          deferrals: p.deferred ? 1 : 0,
        }));
        rows.push(...(await tx.insert(emails).values(chunk).returning()));
      }
      return { campaign, rows };
    });
  } catch (err) {
    await rateLimiter.release(campaignId, reservations);
    throw err;
  }

  if (!created) {
    await rateLimiter.release(campaignId, reservations);
    const winner = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.userId, user.id), eq(campaigns.idempotencyKey, input.idempotencyKey)),
    });
    return { campaign: winner!, duplicate: true as const };
  }

  const windowBySeq = new Map(plan.map((p) => [p.seq, p.reservedWindow]));
  try {
    await enqueueEmails(
      created.rows.map((row) => ({ emailId: row.id, scheduledAt: row.scheduledAt, reservedWindow: windowBySeq.get(row.seq)! })),
    );
  } catch (err) {
    // Rows are safely in Postgres as `scheduled`; the worker re-enqueues them on its next start.
    logger.error({ err, campaignId }, 'Enqueue failed; emails will be recovered on worker start');
  }

  await indexEmails(
    created.rows.map((row) =>
      toDocument(row, { subject: input.subject, body: body.text, senderEmail: senderById.get(row.senderId)?.email }),
    ),
  );

  const times = plan.map((p) => p.scheduledAt.getTime());
  return {
    campaign: created.campaign,
    duplicate: false as const,
    summary: {
      scheduled: plan.length,
      duplicatesRemoved: input.recipients.length - recipients.length,
      deferredByHourlyLimit: plan.filter((p) => p.deferred).length,
      firstSendAt: new Date(Math.min(...times)).toISOString(),
      lastSendAt: new Date(Math.max(...times)).toISOString(),
    },
  };
}
