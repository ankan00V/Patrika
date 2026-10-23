import express, { type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { sql } from 'drizzle-orm';
import { env } from './config/env.js';
import { db } from './db/client.js';
import { redis } from './lib/redis.js';
import { es } from './lib/search.js';
import { authRouter } from './auth/google.js';
import { requireAuth } from './auth/session.js';
import { campaignsRouter } from './modules/campaigns/routes.js';
import { attachmentsRouter, emailsRouter } from './modules/emails/routes.js';
import { sendersRouter } from './modules/senders/routes.js';
import { slackRouter } from './modules/slack/routes.js';
import { emailQueue } from './queue/emailQueue.js';
import { errorHandler, notFound } from './http/errors.js';

export const QUEUE_DASHBOARD_PATH = '/admin/queues';

export function createApp() {
  const app = express();
  // Behind Next.js locally and Caddy (another container) in production.
  app.set('trust proxy', ['loopback', 'uniquelocal']);
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' })); // room for base64 attachments

  // Live BullMQ dashboard (Bull Board). Signed-in users only; anonymous visitors go to login.
  const board = new ExpressAdapter();
  board.setBasePath(QUEUE_DASHBOARD_PATH);
  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter: board,
    options: { uiConfig: { boardTitle: 'Patrika queues' } },
  });
  const boardAuth: RequestHandler = (req, res, next) =>
    requireAuth(req, res, (err?: unknown) => (err ? res.redirect(`${env.APP_URL}/login`) : next()));
  app.use(QUEUE_DASHBOARD_PATH, boardAuth, board.getRouter());

  const api = express.Router();
  api.use(helmet());
  api.get('/health', async (_req, res) => {
    const check = async (fn: () => Promise<unknown>) =>
      fn().then(
        () => 'ok',
        (err: Error) => `down: ${err.message}`,
      );
    const status = {
      postgres: await check(() => db.execute(sql`select 1`)),
      redis: await check(() => redis.ping()),
      elasticsearch: es ? await check(() => es!.ping()) : 'not configured',
    };
    const healthy = status.postgres === 'ok' && status.redis === 'ok';
    res.status(healthy ? 200 : 503).json(status);
  });
  api.use('/auth', authRouter);
  api.use('/campaigns', campaignsRouter);
  api.use('/emails', emailsRouter);
  api.use('/attachments', attachmentsRouter);
  api.use('/senders', sendersRouter);
  api.use('/slack', slackRouter);
  api.use(notFound);

  app.use('/api', api);
  app.use(errorHandler);
  return app;
}
