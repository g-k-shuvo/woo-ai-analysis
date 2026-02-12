/**
 * Redis-backed per-store rate limiter using a sliding window counter.
 *
 * Uses a Redis key per store with TTL equal to the window size.
 * Each chat request increments the counter; requests beyond max are rejected
 * with a RateLimitError that includes the retryAfter duration.
 */

import type { Redis as IORedisType } from 'ioredis';
import { RateLimitError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface RateLimiterConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimiterDeps {
  redis: IORedisType;
  config: RateLimiterConfig;
}

/**
 * Lua script for atomic INCR + EXPIRE.
 * Returns the incremented counter value.
 * Sets TTL only on the first request (when counter == 1) to avoid race conditions
 * where a crash between INCR and EXPIRE could leave a key without TTL.
 */
const INCR_WITH_EXPIRE_LUA = `
local current = redis.call('INCR', KEYS[1])
if tonumber(current) == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export function createRateLimiter(deps: RateLimiterDeps) {
  const { redis, config } = deps;

  /**
   * Check and increment the rate limit counter for a store.
   * Throws RateLimitError if the store has exceeded the allowed requests.
   */
  async function checkLimit(storeId: string): Promise<void> {
    const key = `ratelimit:${storeId}:chat`;

    try {
      // Atomic INCR + EXPIRE via Lua to prevent keys without TTL on crash
      const current = await redis.eval(
        INCR_WITH_EXPIRE_LUA,
        1,
        key,
        config.windowSeconds,
      ) as number;

      if (current > config.maxRequests) {
        const ttl = await redis.ttl(key);
        const retryAfter = ttl > 0 ? ttl : config.windowSeconds;

        logger.warn(
          { storeId, current, max: config.maxRequests, retryAfter },
          'Rate limit exceeded for store',
        );

        throw new RateLimitError(
          "You've sent too many questions. Please wait a moment.",
          { retryAfter },
        );
      }
    } catch (err) {
      // Re-throw RateLimitError as-is
      if (err instanceof RateLimitError) {
        throw err;
      }

      // Redis errors should not block requests — log and allow through
      logger.error(
        { err, storeId },
        'Rate limiter Redis error — allowing request',
      );
    }
  }

  return { checkLimit };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
