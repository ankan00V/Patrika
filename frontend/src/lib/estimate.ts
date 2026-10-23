const HOUR = 3_600_000;

/**
 * Client-side preview of when the last email of a campaign would go out, mirroring the backend
 * planner (spacing by delay, at most `hourlyLimit` per clock hour). Ignores other campaigns and
 * sender caps, so it is a lower bound.
 */
export function estimateLastSend(count: number, startAt: number, delayMs: number, hourlyLimit: number): number {
  if (count === 0 || hourlyLimit < 1) return startAt;
  let previous = -Infinity;
  let window = -1;
  let inWindow = 0;
  let last = startAt;
  for (let i = 0; i < count; i++) {
    let t = Math.max(startAt + i * delayMs, previous + delayMs);
    let w = Math.floor(t / HOUR);
    if (w !== window) {
      window = w;
      inWindow = 0;
    }
    if (inWindow >= hourlyLimit) {
      w = window + 1;
      t = Math.max(w * HOUR, t);
      window = w;
      inWindow = 0;
    }
    inWindow++;
    previous = t;
    last = t;
  }
  return last;
}
