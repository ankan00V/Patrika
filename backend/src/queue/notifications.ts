import { notifyUser } from '../modules/slack/service.js';
import { logger } from '../lib/logger.js';
import { windowStart } from '../lib/time.js';

/** Slack's date token renders in each reader's own timezone. */
const slackTime = (ms: number) => {
  const unix = Math.floor(ms / 1000);
  return `<!date^${unix}^{time}|${new Date(ms).toISOString()}>`;
};

export interface LimitReachedEvent {
  userId: string;
  window: number;
  sender?: { email: string; limit: number };
  campaign?: { subject: string; limit: number };
}

/** Fire-and-forget: a Slack outage must never fail or delay an email job. */
export function notifyLimitReached(event: LimitReachedEvent): void {
  const resumesAt = slackTime(windowStart(event.window + 1));
  const lines: string[] = [];
  if (event.sender) {
    lines.push(
      `:rotating_light: *Hourly limit reached* — sender \`${event.sender.email}\` has sent ${event.sender.limit}/${event.sender.limit} emails this hour.`,
    );
  }
  if (event.campaign) {
    lines.push(
      `:hourglass_flowing_sand: Campaign *${event.campaign.subject}* reached its hourly limit of ${event.campaign.limit} emails.`,
    );
  }
  lines.push(`Remaining emails stay queued and resume at ${resumesAt}. Nothing is dropped.`);

  notifyUser(event.userId, {
    text: lines.join('\n'),
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }],
  }).catch((err) => logger.warn({ err: (err as Error).message }, 'Slack rate-limit notification failed'));
}
