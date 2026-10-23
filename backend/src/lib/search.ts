import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import type { Email, EmailStatus } from '../db/schema.js';

/**
 * Elasticsearch holds a searchable copy of every email (Postgres stays the source of truth).
 * Indexing failures are logged and never block scheduling or sending; search falls back to
 * Postgres when Elasticsearch is not configured or unreachable.
 */
export const es = env.ELASTICSEARCH_URL ? new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 10_000 }) : null;
const index = env.ELASTICSEARCH_INDEX;

export interface EmailDocument {
  id: string;
  userId: string;
  campaignId: string;
  senderId: string;
  senderEmail?: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  updatedAt: string;
}

export function toDocument(email: Email, extra: { subject: string; body: string; senderEmail?: string }): EmailDocument {
  return {
    id: email.id,
    userId: email.userId,
    campaignId: email.campaignId,
    senderId: email.senderId,
    senderEmail: extra.senderEmail,
    recipient: email.recipient,
    subject: extra.subject,
    body: extra.body,
    status: email.status,
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt?.toISOString() ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export async function ensureSearchIndex(): Promise<void> {
  if (!es) return;
  try {
    const exists = await es.indices.exists({ index });
    if (exists) return;
    await es.indices.create({
      index,
      mappings: {
        properties: {
          id: { type: 'keyword' },
          userId: { type: 'keyword' },
          campaignId: { type: 'keyword' },
          senderId: { type: 'keyword' },
          senderEmail: { type: 'keyword' },
          recipient: { type: 'text', fields: { keyword: { type: 'keyword' } }, analyzer: 'simple' },
          subject: { type: 'text' },
          body: { type: 'text' },
          status: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
          updatedAt: { type: 'date' },
        },
      },
    });
    logger.info({ index }, 'Created Elasticsearch index');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Elasticsearch unavailable; search will use Postgres');
  }
}

export async function indexEmails(docs: EmailDocument[]): Promise<void> {
  if (!es || docs.length === 0) return;
  try {
    const operations = docs.flatMap((doc) => [{ index: { _index: index, _id: doc.id } }, doc]);
    const res = await es.bulk({ operations, refresh: false });
    if (res.errors) logger.warn({ index }, 'Some emails failed to index');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Elasticsearch bulk index failed');
  }
}

export async function updateEmailDocument(id: string, patch: Partial<EmailDocument>): Promise<void> {
  if (!es) return;
  try {
    await es.update({ index, id, doc: { ...patch, updatedAt: new Date().toISOString() }, retry_on_conflict: 3 });
  } catch (err) {
    logger.warn({ err: (err as Error).message, id }, 'Elasticsearch update failed');
  }
}

export interface SearchParams {
  userId: string;
  query: string;
  statuses: EmailStatus[];
  page: number;
  pageSize: number;
  sort: { field: 'scheduledAt' | 'sentAt'; order: 'asc' | 'desc' };
}

/** Returns matching email ids in order, or null when Elasticsearch can't answer. */
export async function searchEmailIds(params: SearchParams): Promise<{ ids: string[]; total: number } | null> {
  if (!es) return null;
  try {
    const res = await es.search<EmailDocument>({
      index,
      from: (params.page - 1) * params.pageSize,
      size: params.pageSize,
      track_total_hits: true,
      _source: false,
      query: {
        bool: {
          filter: [{ term: { userId: params.userId } }, { terms: { status: params.statuses } }],
          must: [
            {
              multi_match: {
                query: params.query,
                fields: ['recipient^3', 'subject^2', 'body'],
                type: 'bool_prefix',
                // every typed term must match, so "y@exa" doesn't also return x@example.com
                operator: 'and',
              },
            },
          ],
        },
      },
      sort: [{ [params.sort.field]: { order: params.sort.order, missing: '_last' } }, '_score'],
    });
    const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
    return { ids: res.hits.hits.map((h) => h._id!), total };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Elasticsearch search failed; falling back to Postgres');
    return null;
  }
}
