import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/session.js';
import { HttpError } from '../../http/errors.js';
import { emailStats, getEmail, listEmails } from './service.js';

const listQuery = z.object({
  tab: z.enum(['scheduled', 'sent']).default('scheduled'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
});

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

emailsRouter.get('/', async (req, res) => {
  const { tab, page, pageSize, q } = listQuery.parse(req.query);
  res.json(await listEmails({ userId: currentUser(req).id, tab, page, pageSize, query: q || undefined }));
});

emailsRouter.get('/stats', async (req, res) => {
  res.json(await emailStats(currentUser(req).id));
});

emailsRouter.get('/:id', async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) throw new HttpError(404, 'Email not found');
  const email = await getEmail(currentUser(req).id, id.data);
  if (!email) throw new HttpError(404, 'Email not found');
  res.json(email);
});
