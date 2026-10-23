import { relations } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleId: text('google_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  ...timestamps,
});

/** One Slack incoming-webhook per user, created through the Slack OAuth flow. */
export const slackConnections = pgTable('slack_connections', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull(),
  teamName: text('team_name').notNull(),
  channel: text('channel').notNull(),
  webhookUrl: text('webhook_url').notNull(),
  ...timestamps,
});

/** SMTP mailboxes emails are sent from. Each one has its own hourly limit. */
export const senders = pgTable('senders', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull(),
  smtpUser: text('smtp_user').notNull(),
  smtpPass: text('smtp_pass').notNull(),
  ...timestamps,
});

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Client-generated key so a double-submitted "Schedule" creates one campaign, not two. */
    idempotencyKey: text('idempotency_key').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    delayBetweenMs: integer('delay_between_ms').notNull(),
    hourlyLimit: integer('hourly_limit').notNull(),
    totalEmails: integer('total_emails').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('campaigns_user_idempotency_idx').on(t.userId, t.idempotencyKey)],
);

export const emailStatus = pgEnum('email_status', ['scheduled', 'sending', 'sent', 'failed']);
export type EmailStatus = (typeof emailStatus.enumValues)[number];

export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => senders.id),
    recipient: text('recipient').notNull(),
    /** Position inside the campaign; keeps send order stable when emails get deferred. */
    seq: integer('seq').notNull(),
    status: emailStatus('status').notNull().default('scheduled'),
    /** When the email is due. Moves forward when the hourly limit defers it. */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    /** How many times the hourly limit pushed this email into a later window. */
    deferrals: integer('deferrals').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    messageId: text('message_id'),
    previewUrl: text('preview_url'),
    error: text('error'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('emails_campaign_recipient_idx').on(t.campaignId, t.recipient),
    index('emails_user_status_scheduled_idx').on(t.userId, t.status, t.scheduledAt),
    index('emails_user_status_sent_idx').on(t.userId, t.status, t.sentAt),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  slack: one(slackConnections),
  campaigns: many(campaigns),
}));

export const emailsRelations = relations(emails, ({ one }) => ({
  campaign: one(campaigns, { fields: [emails.campaignId], references: [campaigns.id] }),
  sender: one(senders, { fields: [emails.senderId], references: [senders.id] }),
}));

export type User = typeof users.$inferSelect;
export type Sender = typeof senders.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type SlackConnection = typeof slackConnections.$inferSelect;
