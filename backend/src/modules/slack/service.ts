import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { slackConnections } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';

export function getSlackConnection(userId: string) {
  return db.query.slackConnections.findFirst({ where: eq(slackConnections.userId, userId) });
}

export interface SlackMessage {
  text: string;
  blocks?: unknown[];
}

/**
 * Posts to the user's Slack. Users who never connected (or disconnected) are skipped silently.
 * The connection is read from Postgres on every call, so connecting or disconnecting takes effect
 * immediately in every worker, without a restart.
 */
export async function notifyUser(userId: string, message: SlackMessage): Promise<boolean> {
  const connection = await getSlackConnection(userId);
  if (!connection) return false;

  const res = await fetch(connection.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (res.ok) return true;

  const body = await res.text();
  // Slack answers 404/410 (or 403 "no_service"/"channel_not_found") once the app was removed from
  // the workspace. Drop the stale webhook so the user is shown as disconnected.
  if ([403, 404, 410].includes(res.status)) {
    logger.warn({ userId, status: res.status, body }, 'Slack webhook revoked; removing connection');
    await db.delete(slackConnections).where(eq(slackConnections.userId, userId));
  } else {
    logger.error({ userId, status: res.status, body }, 'Slack notification failed');
  }
  return false;
}
