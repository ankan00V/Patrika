import { Router } from 'express';
import { env } from '../../config/env.js';
import { requireAuth } from '../../auth/session.js';
import { rateLimiter } from '../../queue/limiter.js';
import { listSenders } from './service.js';

export const sendersRouter = Router();
sendersRouter.use(requireAuth);

sendersRouter.get('/', async (_req, res) => {
  const list = await listSenders();
  const usage = await rateLimiter.usage(list.map((s) => s.id));
  res.json({
    hourlyLimitPerSender: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    minDelayBetweenSendsMs: env.MIN_DELAY_BETWEEN_SENDS_MS,
    senders: list.map((s) => ({ id: s.id, name: s.name, email: s.email, sentThisHour: usage[s.id] ?? 0 })),
  });
});
