import { redis } from '../lib/redis.js';
import { RateLimiter } from './rateLimiter.js';

export const rateLimiter = new RateLimiter(redis);
