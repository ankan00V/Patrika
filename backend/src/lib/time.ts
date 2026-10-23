export const HOUR_MS = 60 * 60 * 1000;

/** Rate-limit windows are fixed UTC clock hours, identified by hours since the epoch. */
export function windowOf(ms: number): number {
  return Math.floor(ms / HOUR_MS);
}

export function windowStart(window: number): number {
  return window * HOUR_MS;
}
