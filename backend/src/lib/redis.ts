import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../config/env.js';

/** BullMQ requires maxRetriesPerRequest: null on connections used by workers. */
const options: RedisOptions = { maxRetriesPerRequest: null, enableReadyCheck: true };

export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, options);
}

/** Shared connection for non-blocking commands (rate limiter, dedupe keys, queue producer). */
export const redis = createRedis();
