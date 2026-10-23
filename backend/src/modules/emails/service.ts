import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { attachments, campaigns, emails, senders, type EmailStatus } from '../../db/schema.js';
import { searchEmailIds } from '../../lib/search.js';

export type EmailTab = 'scheduled' | 'sent';

export const TAB_STATUSES: Record<EmailTab, EmailStatus[]> = {
  scheduled: ['scheduled', 'sending'],
  sent: ['sent', 'failed'],
};

const sentOrFailedAt = sql`coalesce(${emails.sentAt}, ${emails.failedAt})`;

const listColumns = {
  id: emails.id,
  campaignId: emails.campaignId,
  recipient: emails.recipient,
  subject: campaigns.subject,
  preview: sql<string>`regexp_replace(left(${campaigns.bodyText}, 200), '[[:space:]]+', ' ', 'g')`,
  status: emails.status,
  starred: emails.starred,
  scheduledAt: emails.scheduledAt,
  sentAt: emails.sentAt,
  failedAt: emails.failedAt,
  deferrals: emails.deferrals,
  attempts: emails.attempts,
  error: emails.error,
  previewUrl: emails.previewUrl,
  senderEmail: senders.email,
  senderName: senders.name,
};

export interface ListParams {
  userId: string;
  tab: EmailTab;
  page: number;
  pageSize: number;
  query?: string;
  /** Narrow to one status of the tab, e.g. only `failed` in Sent. */
  status?: EmailStatus;
  starred?: boolean;
}

export async function listEmails({ userId, tab, page, pageSize, query, status, starred }: ListParams) {
  const statuses = status && TAB_STATUSES[tab].includes(status) ? [status] : TAB_STATUSES[tab];
  const orderBy = tab === 'scheduled' ? [asc(emails.scheduledAt), asc(emails.seq)] : [desc(sentOrFailedAt)];
  const base = db
    .select(listColumns)
    .from(emails)
    .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
    .innerJoin(senders, eq(senders.id, emails.senderId));

  if (query) {
    // Full-text search goes to Elasticsearch; Postgres only hydrates the matching ids.
    const hits = await searchEmailIds({
      userId,
      query,
      statuses,
      page,
      pageSize,
      sort: tab === 'scheduled' ? { field: 'scheduledAt', order: 'asc' } : { field: 'sentAt', order: 'desc' },
    });
    if (hits && !starred) {
      if (hits.ids.length === 0) return { items: [], total: hits.total, page, pageSize, searchEngine: 'elasticsearch' };
      const rows = await base.where(and(eq(emails.userId, userId), inArray(emails.id, hits.ids)));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const items = hits.ids.map((id) => byId.get(id)).filter((r) => r !== undefined);
      return { items, total: hits.total, page, pageSize, searchEngine: 'elasticsearch' };
    }
  }

  const filters: SQL[] = [eq(emails.userId, userId), inArray(emails.status, statuses)];
  if (starred) filters.push(eq(emails.starred, true));
  if (query) {
    const like = `%${query.replace(/[%_\\]/g, '\\$&')}%`;
    filters.push(or(ilike(emails.recipient, like), ilike(campaigns.subject, like), ilike(campaigns.bodyText, like))!);
  }
  const where = and(...filters);

  const [items, [totals]] = await Promise.all([
    base
      .where(where)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(emails)
      .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
      .where(where),
  ]);
  return { items, total: totals?.total ?? 0, page, pageSize, searchEngine: query ? 'postgres' : undefined };
}

export async function emailStats(userId: string) {
  const rows = await db
    .select({ status: emails.status, total: count() })
    .from(emails)
    .where(eq(emails.userId, userId))
    .groupBy(emails.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.total])) as Partial<Record<EmailStatus, number>>;
  return {
    scheduled: (by.scheduled ?? 0) + (by.sending ?? 0),
    sent: by.sent ?? 0,
    failed: by.failed ?? 0,
  };
}

export async function getEmail(userId: string, id: string) {
  const [row] = await db
    .select({ ...listColumns, body: campaigns.body, messageId: emails.messageId })
    .from(emails)
    .innerJoin(campaigns, eq(campaigns.id, emails.campaignId))
    .innerJoin(senders, eq(senders.id, emails.senderId))
    .where(and(eq(emails.userId, userId), eq(emails.id, id)));
  if (!row) return null;
  const files = await db
    .select({ id: attachments.id, filename: attachments.filename, contentType: attachments.contentType, size: attachments.size })
    .from(attachments)
    .where(eq(attachments.campaignId, row.campaignId));
  return { ...row, attachments: files };
}

export async function setStarred(userId: string, id: string, starred: boolean) {
  const [row] = await db
    .update(emails)
    .set({ starred })
    .where(and(eq(emails.userId, userId), eq(emails.id, id)))
    .returning({ id: emails.id, starred: emails.starred });
  return row ?? null;
}

/** Attachment bytes, only if the file belongs to one of the user's campaigns. */
export async function getAttachment(userId: string, id: string) {
  const [row] = await db
    .select({
      filename: attachments.filename,
      contentType: attachments.contentType,
      contentBase64: attachments.contentBase64,
    })
    .from(attachments)
    .innerJoin(campaigns, eq(campaigns.id, attachments.campaignId))
    .where(and(eq(attachments.id, id), eq(campaigns.userId, userId)));
  return row ?? null;
}
