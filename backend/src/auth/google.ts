import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { HttpError } from '../http/errors.js';
import {
  SESSION_COOKIE,
  cookieOptions,
  createSessionToken,
  currentUser,
  requireAuth,
  sessionCookieMaxAge,
} from './session.js';
import { getSlackConnection } from '../modules/slack/service.js';

const STATE_COOKIE = 'patrika_oauth_state';

const tokenResponse = z.object({ access_token: z.string() });
const userInfo = z.object({
  sub: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  picture: z.string().url().optional(),
});

export const authRouter = Router();

authRouter.get('/google', (_req, res) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(503, 'Google login is not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  }
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(STATE_COOKIE, state, cookieOptions(10 * 60 * 1000));
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

authRouter.get('/google/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`${env.APP_URL}/login?error=${encodeURIComponent(reason)}`);
  const { code, state, error } = req.query;
  const expectedState: unknown = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, cookieOptions());

  if (error) return fail(String(error));
  if (typeof code !== 'string' || typeof state !== 'string' || state !== expectedState) {
    return fail('invalid_state');
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    const { access_token } = tokenResponse.parse(await tokenRes.json());

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${access_token}` },
    });
    if (!profileRes.ok) throw new Error(`userinfo failed: ${profileRes.status}`);
    const profile = userInfo.parse(await profileRes.json());

    const [user] = await db
      .insert(users)
      .values({
        googleId: profile.sub,
        email: profile.email,
        name: profile.name ?? profile.email,
        avatarUrl: profile.picture ?? null,
      })
      .onConflictDoUpdate({
        target: users.googleId,
        set: { email: profile.email, name: profile.name ?? profile.email, avatarUrl: profile.picture ?? null },
      })
      .returning();

    res.cookie(SESSION_COOKIE, createSessionToken(user!.id), cookieOptions(sessionCookieMaxAge));
    res.redirect(`${env.APP_URL}/dashboard`);
  } catch (err) {
    logger.error({ err }, 'Google login failed');
    fail('google_login_failed');
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = currentUser(req);
  const slack = await getSlackConnection(user.id);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    slack: slack ? { connected: true, teamName: slack.teamName, channel: slack.channel } : { connected: false },
  });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
});
