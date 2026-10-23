import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRedis } from '../src/lib/redis.js';
import { windowOf } from '../src/lib/time.js';
import { RateLimiter } from '../src/queue/rateLimiter.js';

const redis = createRedis();
const now = Date.now();

describe('RateLimiter (Redis)', () => {
  beforeEach(async () => {
    await redis.flushdb();
  });
  afterAll(async () => {
    await redis.quit();
  });

  it('never hands out more slots than the limits allow, even under concurrent callers', async () => {
    // Separate connections behave like separate worker processes.
    const limiters = Array.from({ length: 5 }, () => new RateLimiter(createRedis()));
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        limiters[i % limiters.length]!.reserve({
          notBefore: now,
          campaignId: 'c1',
          campaignLimit: 25,
          senderLimit: 10,
          senderIds: ['s1', 's2'],
          rotation: i,
        }),
      ),
    );
    const perWindowSender = new Map<string, number>();
    const perWindow = new Map<number, number>();
    for (const r of results) {
      perWindowSender.set(`${r.window}:${r.senderId}`, (perWindowSender.get(`${r.window}:${r.senderId}`) ?? 0) + 1);
      perWindow.set(r.window, (perWindow.get(r.window) ?? 0) + 1);
    }
    expect(Math.max(...perWindowSender.values())).toBeLessThanOrEqual(10);
    expect(Math.max(...perWindow.values())).toBeLessThanOrEqual(20); // 2 senders x 10 caps the campaign's 25
    expect(perWindow.get(windowOf(now))).toBe(20);
    expect(results).toHaveLength(60);
  });

  it('reports the limit as reached exactly once per window', async () => {
    const limiter = new RateLimiter(redis);
    const flags = [];
    for (let i = 0; i < 4; i++) {
      flags.push(
        await limiter.recordSent({ window: windowOf(now), senderId: 's1', senderLimit: 3, campaignId: 'c1', campaignLimit: 100 }),
      );
    }
    expect(flags.map((f) => f.senderLimitReached)).toEqual([false, false, true, false]);
  });
});
