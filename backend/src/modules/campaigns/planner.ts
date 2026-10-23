import { windowOf, windowStart } from '../../lib/time.js';
import type { Reservation } from '../../queue/rateLimiter.js';

export interface PlannedEmail {
  recipient: string;
  seq: number;
  scheduledAt: Date;
  senderId: string;
  reservedWindow: number;
  /** True when the hourly limit pushed this email past its natural slot. */
  deferred: boolean;
}

export interface PlanInput {
  recipients: string[];
  startAt: number;
  delayBetweenMs: number;
  /** Reserves a rate-limit slot at or after `notBefore` (see RateLimiter.reserve). */
  reserve: (notBefore: number, seq: number) => Promise<Reservation>;
}

/**
 * Turns a campaign into concrete send times, in recipient order:
 *   email i goes out no earlier than startAt + i * delay, and never earlier than delay after
 *   the previous email. If that hour is already full (campaign or sender limit), the email
 *   moves to the start of the next hour that has room. Order is preserved because each email
 *   is planned after the previous one and never before it.
 */
export async function planSchedule(input: PlanInput): Promise<PlannedEmail[]> {
  const planned: PlannedEmail[] = [];
  let previous = -Infinity;

  for (const [seq, recipient] of input.recipients.entries()) {
    const natural = input.startAt + seq * input.delayBetweenMs;
    const candidate = Math.max(natural, previous + input.delayBetweenMs);
    const reservation = await input.reserve(candidate, seq);
    const scheduledAt =
      reservation.window === windowOf(candidate) ? candidate : Math.max(windowStart(reservation.window), candidate);

    planned.push({
      recipient,
      seq,
      scheduledAt: new Date(scheduledAt),
      senderId: reservation.senderId,
      reservedWindow: reservation.window,
      deferred: scheduledAt > natural,
    });
    previous = scheduledAt;
  }
  return planned;
}
