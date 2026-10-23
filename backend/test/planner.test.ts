import { describe, expect, it } from 'vitest';
import { planSchedule } from '../src/modules/campaigns/planner.js';
import { HOUR_MS, windowOf } from '../src/lib/time.js';

/** In-memory stand-in for the Redis reservation: `limit` emails per hour window. */
function fakeReserve(limit: number) {
  const counts = new Map<number, number>();
  return async (notBefore: number) => {
    for (let w = windowOf(notBefore); ; w++) {
      const c = counts.get(w) ?? 0;
      if (c < limit) {
        counts.set(w, c + 1);
        return { window: w, senderId: 's1' };
      }
    }
  };
}

const start = Date.UTC(2026, 0, 1, 10, 0, 0);
const recipients = Array.from({ length: 7 }, (_, i) => `r${i}@example.com`);

describe('planSchedule', () => {
  it('spaces emails by the configured delay', async () => {
    const plan = await planSchedule({ recipients, startAt: start, delayBetweenMs: 5000, reserve: fakeReserve(100) });
    expect(plan.map((p) => p.scheduledAt.getTime() - start)).toEqual([0, 5000, 10000, 15000, 20000, 25000, 30000]);
    expect(plan.every((p) => !p.deferred)).toBe(true);
  });

  it('pushes emails over the hourly limit into following hours, keeping order and spacing', async () => {
    const plan = await planSchedule({ recipients, startAt: start, delayBetweenMs: 1000, reserve: fakeReserve(3) });
    const offsets = plan.map((p) => p.scheduledAt.getTime() - start);
    expect(offsets).toEqual([0, 1000, 2000, HOUR_MS, HOUR_MS + 1000, HOUR_MS + 2000, 2 * HOUR_MS]);
    expect(plan.map((p) => p.deferred)).toEqual([false, false, false, true, true, true, true]);
    expect(plan.map((p) => p.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('handles 1000+ emails at the same instant without exceeding the limit in any hour', async () => {
    const many = Array.from({ length: 1200 }, (_, i) => `lead${i}@example.com`);
    const plan = await planSchedule({ recipients: many, startAt: start, delayBetweenMs: 0, reserve: fakeReserve(200) });
    const perHour = new Map<number, number>();
    for (const p of plan) perHour.set(windowOf(p.scheduledAt.getTime()), (perHour.get(windowOf(p.scheduledAt.getTime())) ?? 0) + 1);
    expect([...perHour.values()]).toEqual([200, 200, 200, 200, 200, 200]);
    const times = plan.map((p) => p.scheduledAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
