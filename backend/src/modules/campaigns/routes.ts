import { Router } from 'express';
import { currentUser, requireAuth } from '../../auth/session.js';
import { createCampaign, createCampaignSchema } from './service.js';

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

campaignsRouter.post('/', async (req, res) => {
  const input = createCampaignSchema.parse(req.body);
  const result = await createCampaign(currentUser(req), input);
  res.status(result.duplicate ? 200 : 201).json(result);
});
