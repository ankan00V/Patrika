import 'dotenv/config';
import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default('info'),

  /** Public URL of the dashboard. The API is reached through it (Next.js rewrites /api/*). */
  APP_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().default('postgres://patrika:patrika@localhost:5432/patrika'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: optional,
  ELASTICSEARCH_INDEX: z.string().default('patrika-emails'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REDIRECT_URI: optional,

  SLACK_CLIENT_ID: optional,
  SLACK_CLIENT_SECRET: optional,
  SLACK_REDIRECT_URI: optional,

  /** Name of the BullMQ queue that holds one job per email. */
  EMAIL_QUEUE_NAME: z.string().default('patrika-emails'),
  /** How many jobs one worker process handles in parallel. */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  /** Minimum gap between two SMTP sends, enforced by the BullMQ limiter across all workers. */
  MIN_DELAY_BETWEEN_SENDS_MS: z.coerce.number().int().min(0).default(2000),
  /** Hard hourly cap per sender mailbox, enforced with Redis counters. */
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(200),
  /** Upper bound for the per-campaign hourly limit a user can pick in the UI. */
  MAX_CAMPAIGN_HOURLY_LIMIT: z.coerce.number().int().min(1).default(1000),
  /** SMTP retries before an email is marked failed. */
  SEND_ATTEMPTS: z.coerce.number().int().min(1).default(3),

  /**
   * Sender mailboxes as "user:pass" pairs separated by commas (Ethereal credentials).
   * When empty, SENDER_COUNT Ethereal accounts are created automatically on first boot
   * and stored in Postgres so they stay the same across restarts.
   */
  ETHEREAL_SENDERS: optional,
  SENDER_COUNT: z.coerce.number().int().min(1).max(20).default(3),
  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.coerce.number().int().default(587),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  GOOGLE_REDIRECT_URI: raw.GOOGLE_REDIRECT_URI ?? `${raw.APP_URL}/api/auth/google/callback`,
  SLACK_REDIRECT_URI: raw.SLACK_REDIRECT_URI ?? `${raw.APP_URL}/api/slack/callback`,
};

export type Env = typeof env;
