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

export function createRateLimiter(deps: RateLimiterDeps) {
  const { redis, config } = deps;

  /**
   * Check and increment the rate limit counter for a store.
   * Throws RateLimitError if the store has exceeded the allowed requests.
   */
  async function checkLimit(storeId: string): Promise<void> {
    const key = `ratelimit:${storeId}:chat`;

    try {
      const current = await redis.incr(key);

      // Set TTL on first request in the window
      if (current === 1) {
        await redis.expire(key, config.windowSeconds);
      }

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
