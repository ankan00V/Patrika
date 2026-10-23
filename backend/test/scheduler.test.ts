import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { env } from '../src/config/env.js';
import { db, pool } from '../src/db/client.js';
import { emails, type User } from '../src/db/schema.js';
import { createRedis, redis } from '../src/lib/redis.js';
import { windowOf } from '../src/lib/time.js';
import { createCampaign } from '../src/modules/campaigns/service.js';
import { closeTransports } from '../src/modules/senders/mailer.js';
import { emailQueue, enqueueEmails } from '../src/queue/emailQueue.js';
import { processEmailJob } from '../src/queue/processor.js';
import { reconcileScheduledEmails } from '../src/queue/reconcile.js';
import { resetState, seedUserAndSenders, startSmtpSink, waitFor } from './helpers.js';

let smtp: Awaited<ReturnType<typeof startSmtpSink>>;
let user: User;

const startWorker = () =>
  new Worker(env.EMAIL_QUEUE_NAME, processEmailJob, { connection: createRedis(), concurrency: 5 });

const campaignInput = (overrides: Partial<Parameters<typeof createCampaign>[1]> = {}) => ({
  idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
  subject: 'Quarterly update',
  body: 'Hello!',
  recipients: ['a@example.com', 'b@example.com', 'c@example.com'],
  startAt: new Date(),
  delayBetweenSeconds: 0,
  hourlyLimit: 100,
  ...overrides,
});

const statuses = async () =>
  (await db.select({ status: emails.status }).from(emails)).map((r) => r.status).sort();

describe('scheduler (Postgres + Redis + BullMQ)', () => {
  beforeAll(async () => {
    smtp = await startSmtpSink();
  });
  beforeEach(async () => {
    await resetState();
    smtp.received.length = 0;
    ({ user } = await seedUserAndSenders(smtp.port));
  });
  afterAll(async () => {
    closeTransports();
    await smtp.close();
    await emailQueue.close();
    await redis.quit();
    await pool.end();
  });

  it('sends every due email exactly once', async () => {
    await createCampaign(user, campaignInput());
    const worker = startWorker();
    await waitFor(async () => (await statuses()).every((s) => s === 'sent'));
    await worker.close();

    expect(smtp.received.map((m) => m.to[0]).sort()).toEqual(['a@example.com', 'b@example.com', 'c@example.com']);
  });

  it('treats a repeated Schedule request with the same idempotency key as one campaign', async () => {
    const input = campaignInput();
    const first = await createCampaign(user, input);
    const second = await createCampaign(user, input);
    expect(second.duplicate).toBe(true);
    expect(second.campaign.id).toBe(first.campaign.id);
    expect(await db.$count(emails)).toBe(3);
    expect(await emailQueue.count()).toBe(3);
  });

  it('never sends twice when the same job is enqueued or processed again', async () => {
    await createCampaign(user, campaignInput({ recipients: ['once@example.com'] }));
    const [row] = await db.select().from(emails);

    // Re-adding a job with the same id is a no-op in BullMQ.
    await enqueueEmails([{ emailId: row!.id, scheduledAt: new Date(), reservedWindow: windowOf(Date.now()) }]);
    expect(await emailQueue.count()).toBe(1);

    const worker = startWorker();
    await waitFor(async () => (await statuses())[0] === 'sent');
    await worker.close();

    // A stray second run (e.g. a stalled job retried) finds the row already sent and skips it.
    const fakeJob = { data: { emailId: row!.id, reservedWindow: windowOf(Date.now()) } } as never;
    expect(await processEmailJob(fakeJob)).toEqual({ outcome: 'skipped', reason: 'already sent' });
    expect(smtp.received).toHaveLength(1);
  });

  it('survives a restart: emails due while the worker was down are sent once it is back', async () => {
    await createCampaign(user, campaignInput({ startAt: new Date(Date.now() + 1500) }));
    let worker = startWorker();
    await worker.close(); // "server stops" before the emails are due
    await new Promise((r) => setTimeout(r, 2000));
    expect(smtp.received).toHaveLength(0);

    await reconcileScheduledEmails(); // what the worker does on boot
    worker = startWorker();
    await waitFor(async () => (await statuses()).every((s) => s === 'sent'));
    await worker.close();
    expect(smtp.received).toHaveLength(3);
  });

  it('re-creates jobs that Redis lost, without duplicating existing ones', async () => {
    await createCampaign(user, campaignInput({ startAt: new Date(Date.now() + 60_000) }));
    const [lost] = await db.select().from(emails).limit(1);
    await (await emailQueue.getJob(lost!.id))!.remove();

    const result = await reconcileScheduledEmails();
    expect(result).toEqual({ checked: 3, recovered: 1 });
    expect(await emailQueue.getDelayedCount()).toBe(3);
  });

  it('defers a late email to the next hour instead of failing when the current hour is full', async () => {
    const { campaign } = await createCampaign(user, campaignInput({ recipients: ['late@example.com'], hourlyLimit: 1 }));
    const [row] = await db.select().from(emails);
    const job = (await emailQueue.getJob(row!.id))!;
    await job.remove();

    // Simulate: the job was planned for an earlier hour, and this hour's campaign slot is taken.
    const nowWindow = windowOf(Date.now());
    await redis.set(`patrika:rl:campaign:${campaign.id}:${nowWindow}`, 1);
    await emailQueue.add('send-email', { emailId: row!.id, reservedWindow: nowWindow - 1 }, { jobId: row!.id });

    const worker = startWorker();
    await waitFor(async () => (await emailQueue.getDelayedCount()) === 1);
    await worker.close();

    const [after] = await db.select().from(emails).where(eq(emails.id, row!.id));
    expect(after!.status).toBe('scheduled');
    expect(after!.deferrals).toBe(1);
    expect(windowOf(after!.scheduledAt.getTime())).toBe(nowWindow + 1);
    expect(smtp.received).toHaveLength(0);
  });

  it('marks an email failed after the configured attempts when SMTP keeps rejecting it', async () => {
    closeTransports(); // drop pooled connections so the sink can shut down
    await smtp.close();
    await createCampaign(user, campaignInput({ recipients: ['bounce@example.com'] }));
    const worker = startWorker();
    // first attempt fails; skip the 30s backoff by promoting the retry
    await waitFor(async () => (await emailQueue.getDelayedCount()) === 1 || (await statuses())[0] === 'failed');
    const [job] = await emailQueue.getDelayed();
    await job?.promote();
    await waitFor(async () => (await statuses())[0] === 'failed', 15_000);
    await worker.close();

    const [row] = await db.select().from(emails);
    expect(row!.attempts).toBe(2);
    expect(row!.error).toBeTruthy();
    smtp = await startSmtpSink();
  });
});
