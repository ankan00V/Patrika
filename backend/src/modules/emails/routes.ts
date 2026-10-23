import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../auth/session.js';
import { HttpError } from '../../http/errors.js';
import { emailStats, getAttachment, getEmail, listEmails, setStarred } from './service.js';

const listQuery = z.object({
  tab: z.enum(['scheduled', 'sent']).default('scheduled'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  status: z.enum(['scheduled', 'sending', 'sent', 'failed']).optional(),
  starred: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const uuidParam = (value: unknown, what: string) => {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new HttpError(404, `${what} not found`);
  return parsed.data;
};

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

emailsRouter.get('/', async (req, res) => {
  const { tab, page, pageSize, q, status, starred } = listQuery.parse(req.query);
  res.json(
    await listEmails({ userId: currentUser(req).id, tab, page, pageSize, query: q || undefined, status, starred }),
  );
});

emailsRouter.get('/stats', async (req, res) => {
  res.json(await emailStats(currentUser(req).id));
});

emailsRouter.get('/:id', async (req, res) => {
  const email = await getEmail(currentUser(req).id, uuidParam(req.params.id, 'Email'));
  if (!email) throw new HttpError(404, 'Email not found');
  res.json(email);
});

emailsRouter.patch('/:id/star', async (req, res) => {
  const { starred } = z.object({ starred: z.boolean() }).parse(req.body);
  const row = await setStarred(currentUser(req).id, uuidParam(req.params.id, 'Email'), starred);
  if (!row) throw new HttpError(404, 'Email not found');
  res.json(row);
});

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

attachmentsRouter.get('/:id', async (req, res) => {
  const file = await getAttachment(currentUser(req).id, uuidParam(req.params.id, 'Attachment'));
  if (!file) throw new HttpError(404, 'Attachment not found');
  const inline = /^image\/(png|jpe?g|gif|webp)$/.test(file.contentType);
  res
    .set({
      'content-type': file.contentType,
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.filename)}"`,
      'content-security-policy': 'sandbox',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=3600',
    })
    .send(Buffer.from(file.contentBase64, 'base64'));
});
