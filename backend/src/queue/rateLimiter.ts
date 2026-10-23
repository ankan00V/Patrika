import type { Redis } from 'ioredis';
import { windowOf } from '../lib/time.js';

/**
 * Hourly limits are enforced with Redis counters keyed by `<owner>:<hour window>`, so every
 * API instance and worker sees the same numbers. Two limits apply to every email:
 *   - the sender mailbox limit (MAX_EMAILS_PER_HOUR_PER_SENDER, from env)
 *   - the campaign limit the user picked in the compose form
 *
 * `reserve` atomically finds the earliest hour window (>= the requested one) where the campaign
 * and at least one sender still have room, increments both counters and returns that window and
 * the sender it picked. Because it runs as a single Lua script, two workers can never both take
 * the last slot of an hour.
 */
const RESERVE_SCRIPT = `
local startWindow = tonumber(ARGV[1])
local senderLimit = tonumber(ARGV[2])
local campaignLimit = tonumber(ARGV[3])
local campaignPrefix = ARGV[4]
local lookahead = tonumber(ARGV[5])
local rotation = tonumber(ARGV[6])
local senderCount = #ARGV - 6

for w = startWindow, startWindow + lookahead do
  local ck = campaignPrefix .. w
  local c = tonumber(redis.call('GET', ck) or '0')
  if c < campaignLimit then
    for j = 0, senderCount - 1 do
      local idx = (rotation + j) % senderCount
      local sk = ARGV[7 + idx] .. w
      local s = tonumber(redis.call('GET', sk) or '0')
      if s < senderLimit then
        -- keep counters one day past the end of their hour
        local expireAt = (w + 1) * 3600 + 86400
        redis.call('INCR', sk)
        redis.call('EXPIREAT', sk, expireAt)
        redis.call('INCR', ck)
        redis.call('EXPIREAT', ck, expireAt)
        return { w, idx }
      end
    end
  end
end
return { -1, -1 }
`;

/** How far ahead (in hours) the limiter looks for a free window: 30 days. */
const MAX_LOOKAHEAD_HOURS = 24 * 30;

const KEY_PREFIX = 'patrika:rl';
const senderKey = (senderId: string) => `${KEY_PREFIX}:sender:${senderId}:`;
const campaignKey = (campaignId: string) => `${KEY_PREFIX}:campaign:${campaignId}:`;

export interface ReserveInput {
  /** Earliest time the email may go out. */
  notBefore: number;
  campaignId: string;
  campaignLimit: number;
  senderLimit: number;
  senderIds: string[];
  /** Which sender to try first; rotating it spreads a campaign across mailboxes. */
  rotation: number;
}

export interface Reservation {
  window: number;
  senderId: string;
}

export class RateLimiter {
  constructor(private readonly redis: Redis) {
    this.redis.defineCommand('patrikaReserve', { numberOfKeys: 0, lua: RESERVE_SCRIPT });
  }

  async reserve(input: ReserveInput): Promise<Reservation> {
    if (input.senderIds.length === 0) throw new Error('No senders configured');
    const [window, idx] = (await (this.redis as RedisWithReserve).patrikaReserve(
      windowOf(input.notBefore),
      input.senderLimit,
      input.campaignLimit,
      campaignKey(input.campaignId),
      MAX_LOOKAHEAD_HOURS,
      input.rotation % input.senderIds.length,
      ...input.senderIds.map(senderKey),
    )) as [number, number];
    if (window < 0) throw new Error('No free sending window in the next 30 days');
    return { window, senderId: input.senderIds[idx]! };
  }

  /** Gives slots back, e.g. when the campaign insert fails after planning. */
  async release(campaignId: string, reservations: Reservation[]): Promise<void> {
    if (reservations.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const r of reservations) {
      pipeline.decr(senderKey(r.senderId) + r.window);
      pipeline.decr(campaignKey(campaignId) + r.window);
    }
    await pipeline.exec();
  }

  /**
   * Counts an email that actually went out. Returns which limits this send just reached, so the
   * caller can alert the user exactly once per window (INCR returns the limit value only once).
   */
  async recordSent(args: {
    window: number;
    senderId: string;
    senderLimit: number;
    campaignId: string;
    campaignLimit: number;
  }): Promise<{ senderLimitReached: boolean; campaignLimitReached: boolean }> {
    const sk = `${KEY_PREFIX}:sent:sender:${args.senderId}:${args.window}`;
    const ck = `${KEY_PREFIX}:sent:campaign:${args.campaignId}:${args.window}`;
    const expireAt = (args.window + 1) * 3600 + 86400;
    const results = await this.redis
      .multi()
      .incr(sk)
      .expireat(sk, expireAt)
      .incr(ck)
      .expireat(ck, expireAt)
      .exec();
    const senderCount = Number(results?.[0]?.[1] ?? 0);
    const campaignCount = Number(results?.[2]?.[1] ?? 0);
    return {
      senderLimitReached: senderCount === args.senderLimit,
      campaignLimitReached: campaignCount === args.campaignLimit,
    };
  }

  async usage(senderIds: string[], at = Date.now()): Promise<Record<string, number>> {
    const w = windowOf(at);
    if (senderIds.length === 0) return {};
    const values = await this.redis.mget(senderIds.map((id) => `${KEY_PREFIX}:sent:sender:${id}:${w}`));
    return Object.fromEntries(senderIds.map((id, i) => [id, Number(values[i] ?? 0)]));
  }
}

type RedisWithReserve = Redis & { patrikaReserve: (...args: (string | number)[]) => Promise<unknown> };
