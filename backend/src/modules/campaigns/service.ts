import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { campaigns, emails, type User } from '../../db/schema.js';
import { HttpError } from '../../http/errors.js';
import { logger } from '../../lib/logger.js';
import { indexEmails, toDocument } from '../../lib/search.js';
import { enqueueEmails } from '../../queue/emailQueue.js';
import { rateLimiter } from '../../queue/limiter.js';
import type { Reservation } from '../../queue/rateLimiter.js';
import { listSenders } from '../senders/service.js';
import { planSchedule } from './planner.js';

export const MAX_RECIPIENTS = 10_000;

export const createCampaignSchema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  subject: z.string().trim().min(1, 'Subject is required').max(300),
  body: z.string().trim().min(1, 'Body is required').max(50_000),
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

  const senderList = await listSenders();
  if (senderList.length === 0) throw new HttpError(503, 'No sender mailboxes are configured yet');
  const senderById = new Map(senderList.map((s) => [s.id, s]));

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
          body: input.body,
          startAt: new Date(startAt),
          delayBetweenMs: input.delayBetweenSeconds * 1000,
          hourlyLimit: input.hourlyLimit,
          totalEmails: plan.length,
        })
        .onConflictDoNothing()
        .returning();
      if (!campaign) return null; // a concurrent request with the same key won the race

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
      toDocument(row, { subject: input.subject, body: input.body, senderEmail: senderById.get(row.senderId)?.email }),
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
