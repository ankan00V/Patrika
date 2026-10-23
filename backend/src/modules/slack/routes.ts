import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { slackConnections } from '../../db/schema.js';
import { currentUser, requireAuth, signState, verifyState } from '../../auth/session.js';
import { HttpError } from '../../http/errors.js';
import { logger } from '../../lib/logger.js';
import { notifyUser } from './service.js';

const oauthResponse = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  team: z.object({ id: z.string(), name: z.string() }).optional(),
  incoming_webhook: z.object({ url: z.string().url(), channel: z.string() }).optional(),
});

export const slackRouter = Router();

/** Step 1: send the user to Slack's consent screen. */
slackRouter.get('/install', requireAuth, (req, res) => {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    throw new HttpError(503, 'Slack is not configured (set SLACK_CLIENT_ID / SLACK_CLIENT_SECRET)');
  }
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'incoming-webhook',
    redirect_uri: env.SLACK_REDIRECT_URI,
    state: signState({ uid: currentUser(req).id }),
  });
  res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
});

/** Step 2: Slack redirects back with a code; exchange it for the incoming webhook and store it. */
slackRouter.get('/callback', async (req, res) => {
  const done = (status: string) => res.redirect(`${env.APP_URL}/dashboard?slack=${status}`);
  if (req.query.error) return done('cancelled');

  const { uid } = verifyState<{ uid: string }>(req.query.state);
  const code = req.query.code;
  if (typeof code !== 'string') return done('error');

  try {
    const exchange = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.SLACK_CLIENT_ID!,
        client_secret: env.SLACK_CLIENT_SECRET!,
        redirect_uri: env.SLACK_REDIRECT_URI,
      }),
    });
    const data = oauthResponse.parse(await exchange.json());
    if (!data.ok || !data.incoming_webhook || !data.team) throw new Error(data.error ?? 'missing webhook');

    const values = {
      teamId: data.team.id,
      teamName: data.team.name,
      channel: data.incoming_webhook.channel,
      webhookUrl: data.incoming_webhook.url,
    };
    await db
      .insert(slackConnections)
      .values({ userId: uid, ...values })
      .onConflictDoUpdate({ target: slackConnections.userId, set: values });

    await notifyUser(uid, {
      text: ':white_check_mark: Patrika is connected. You will get a message here whenever a sender hits its hourly limit.',
    });
    done('connected');
  } catch (err) {
    logger.error({ err }, 'Slack OAuth failed');
    done('error');
  }
});

slackRouter.post('/test', requireAuth, async (req, res) => {
  const sent = await notifyUser(currentUser(req).id, { text: ':wave: Test notification from Patrika.' });
  if (!sent) throw new HttpError(409, 'Slack is not connected');
  res.json({ ok: true });
});

slackRouter.delete('/', requireAuth, async (req, res) => {
  await db.delete(slackConnections).where(eq(slackConnections.userId, currentUser(req).id));
  res.status(204).end();
});
