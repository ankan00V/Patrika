import { Router, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, type User } from '../db/schema.js';
import { redis } from '../lib/redis.js';
import { hashPassword, verifyPassword } from './password.js';
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

    const user = await upsertGoogleUser(profile);
    startSession(res, user.id);
    res.redirect(`${env.APP_URL}/dashboard`);
  } catch (err) {
    logger.error({ err }, 'Google login failed');
    fail('google_login_failed');
  }
});

/** Find the account by Google id, else link it to an existing email account, else create one. */
async function upsertGoogleUser(profile: z.infer<typeof userInfo>): Promise<User> {
  const email = profile.email.toLowerCase();
  const profileFields = { name: profile.name ?? email, avatarUrl: profile.picture ?? null };
  const byGoogle = await db.query.users.findFirst({ where: eq(users.googleId, profile.sub) });
  const byEmail = byGoogle ?? (await db.query.users.findFirst({ where: eq(users.email, email) }));
  if (byEmail) {
    const [updated] = await db
      .update(users)
      .set({ googleId: profile.sub, email, ...profileFields })
      .where(eq(users.id, byEmail.id))
      .returning();
    return updated!;
  }
  const [created] = await db.insert(users).values({ googleId: profile.sub, email, ...profileFields }).returning();
  return created!;
}

function startSession(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE, createSessionToken(userId), cookieOptions(sessionCookieMaxAge));
}

const emailLogin = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

const LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

/**
 * "Login" and "or sign up through email" in one step: an unknown address creates an account,
 * a known one must match its password. Attempts are throttled per IP + address in Redis.
 */
authRouter.post('/email', async (req, res) => {
  const { email, password } = emailLogin.parse(req.body);

  const throttleKey = `patrika:login:${req.ip}:${email}`;
  const attempts = await redis.incr(throttleKey);
  if (attempts === 1) await redis.expire(throttleKey, LOGIN_WINDOW_SECONDS);
  if (attempts > LOGIN_ATTEMPTS) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  let user: User;
  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({ email, name: email.split('@')[0]!, passwordHash: await hashPassword(password) })
      .returning();
    user = created!;
  } else if (!existing.passwordHash) {
    throw new HttpError(409, 'This email uses Google sign-in. Continue with Google instead.');
  } else if (!(await verifyPassword(password, existing.passwordHash))) {
    throw new HttpError(401, 'Incorrect email or password');
  } else {
    user = existing;
  }

  await redis.del(throttleKey);
  startSession(res, user.id);
  res.status(existing ? 200 : 201).json({ created: !existing });
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
