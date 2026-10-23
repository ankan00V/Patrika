import { z } from 'zod';
import { asc, sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { senders, type Sender } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';

const SENDER_NAMES = ['Patrika Outreach', 'Patrika Growth', 'Patrika Sales', 'Patrika Team', 'Patrika Partners'];

/**
 * Makes sure sender mailboxes exist. Credentials from ETHEREAL_SENDERS win; otherwise Ethereal
 * test accounts are created once and kept in Postgres, so the same mailboxes (and their hourly
 * counters) are used after every restart.
 */
export async function ensureSenders(): Promise<Sender[]> {
  // Advisory lock: if several API instances boot at once, only one creates accounts.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('patrika:senders'))`);

    if (env.ETHEREAL_SENDERS) {
      const pairs = env.ETHEREAL_SENDERS.split(',').map((p) => p.trim()).filter(Boolean);
      for (const [i, pair] of pairs.entries()) {
        const sep = pair.indexOf(':');
        if (sep < 1) throw new Error(`ETHEREAL_SENDERS entry #${i + 1} must look like user:pass`);
        const user = pair.slice(0, sep);
        const pass = pair.slice(sep + 1);
        const values = {
          name: SENDER_NAMES[i % SENDER_NAMES.length]!,
          email: user,
          smtpHost: env.SMTP_HOST,
          smtpPort: env.SMTP_PORT,
          smtpUser: user,
          smtpPass: pass,
        };
        await tx.insert(senders).values(values).onConflictDoUpdate({ target: senders.email, set: values });
      }
    } else {
      const existing = await tx.select({ id: senders.id }).from(senders);
      for (let i = existing.length; i < env.SENDER_COUNT; i++) {
        const account = await createEtherealAccount();
        await tx.insert(senders).values({
          name: SENDER_NAMES[i % SENDER_NAMES.length]!,
          email: account.user,
          smtpHost: account.smtp.host,
          smtpPort: account.smtp.port,
          smtpUser: account.user,
          smtpPass: account.pass,
        });
        logger.info({ email: account.user }, 'Created Ethereal sender mailbox');
      }
    }

    return tx.select().from(senders).orderBy(asc(senders.createdAt), asc(senders.email));
  });
}

const etherealAccount = z.object({
  status: z.literal('success'),
  user: z.string(),
  pass: z.string(),
  smtp: z.object({ host: z.string(), port: z.number() }),
});

/**
 * Creates a fresh Ethereal mailbox. nodemailer.createTestAccount() caches one account per
 * process, so we call the same endpoint directly to get distinct mailboxes.
 */
async function createEtherealAccount() {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestor: 'patrika', version: '1.0.0' }),
  });
  if (!res.ok) throw new Error(`Could not create an Ethereal account (HTTP ${res.status})`);
  return etherealAccount.parse(await res.json());
}

export function listSenders(): Promise<Sender[]> {
  return db.select().from(senders).orderBy(asc(senders.createdAt), asc(senders.email));
}
