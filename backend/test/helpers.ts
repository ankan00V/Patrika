import { SMTPServer } from 'smtp-server';
import type { AddressInfo } from 'node:net';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { senders, users } from '../src/db/schema.js';
import { redis } from '../src/lib/redis.js';
import { emailQueue } from '../src/queue/emailQueue.js';

export interface ReceivedMessage {
  from: string;
  to: string[];
  raw: string;
}

/** A local SMTP sink standing in for Ethereal. */
export async function startSmtpSink() {
  const received: ReceivedMessage[] = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onAuth: (_auth, _session, cb) => cb(null, { user: 'test' }),
    onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((r) => r.address),
          raw: Buffer.concat(chunks).toString(),
        });
        cb();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.server.address() as AddressInfo).port;
  return { port, received, close: () => new Promise<void>((r) => server.close(() => r())) };
}

export async function resetState() {
  await db.execute(sql`truncate emails, campaigns, slack_connections, senders, users cascade`);
  await emailQueue.obliterate({ force: true });
  await redis.flushdb();
}

export async function seedUserAndSenders(smtpPort: number, count = 2) {
  const [user] = await db
    .insert(users)
    .values({ googleId: 'g-1', email: 'owner@example.com', name: 'Owner' })
    .returning();
  const senderRows = await db
    .insert(senders)
    .values(
      Array.from({ length: count }, (_, i) => ({
        name: `Sender ${i + 1}`,
        email: `sender${i + 1}@ethereal.email`,
        smtpHost: '127.0.0.1',
        smtpPort,
        smtpUser: `sender${i + 1}@ethereal.email`,
        smtpPass: 'pass',
      })),
    )
    .returning();
  return { user: user!, senders: senderRows };
}

export async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('waitFor timed out');
}
