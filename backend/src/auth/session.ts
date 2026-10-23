import type { CookieOptions, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/client.js';
import { users, type User } from '../db/schema.js';
import { HttpError } from '../http/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const SESSION_COOKIE = 'patrika_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const cookieOptions = (maxAgeMs?: number): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
  maxAge: maxAgeMs,
});

export function createSessionToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: SESSION_TTL_SECONDS });
}

export const sessionCookieMaxAge = SESSION_TTL_SECONDS * 1000;

/** Short-lived signed value used as OAuth `state` (CSRF protection for Google and Slack flows). */
export function signState(payload: Record<string, string>): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '10m' });
}

export function verifyState<T extends Record<string, string>>(state: unknown): T {
  if (typeof state !== 'string') throw new HttpError(400, 'Missing OAuth state');
  try {
    return jwt.verify(state, env.JWT_SECRET) as unknown as T;
  } catch {
    throw new HttpError(400, 'Invalid or expired OAuth state');
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string') return next(new HttpError(401, 'Not signed in'));
  let userId: string;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || !payload.sub) throw new Error('bad payload');
    userId = payload.sub;
  } catch {
    return next(new HttpError(401, 'Session expired'));
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return next(new HttpError(401, 'User not found'));
  req.user = user;
  next();
};

export function currentUser(req: Express.Request): User {
  if (!req.user) throw new HttpError(401, 'Not signed in');
  return req.user;
}
