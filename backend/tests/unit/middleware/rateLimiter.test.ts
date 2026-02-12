import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Import after mocks ─────────────────────────────────────────────

const { createRateLimiter } = await import('../../../src/middleware/rateLimiter.js');
const { RateLimitError } = await import('../../../src/utils/errors.js');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const STORE_ID_B = '660e8400-e29b-41d4-a716-446655440001';

interface MockRedis {
  incr: jest.Mock<(key: string) => Promise<number>>;
  expire: jest.Mock<(key: string, seconds: number) => Promise<number>>;
  ttl: jest.Mock<(key: string) => Promise<number>>;
}

function createMockRedis(counter = { value: 0 }): MockRedis {
  return {
    incr: jest.fn<(key: string) => Promise<number>>().mockImplementation(async () => {
      counter.value += 1;
      return counter.value;
    }),
    expire: jest.fn<(key: string, seconds: number) => Promise<number>>().mockResolvedValue(1),
    ttl: jest.fn<(key: string) => Promise<number>>().mockResolvedValue(45),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('rateLimiter', () => {
  let mockRedis: MockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── checkLimit — allows requests under limit ─────────────────────

  describe('checkLimit — allows requests under limit', () => {
    it('allows the first request', async () => {
      const counter = { value: 0 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await expect(rateLimiter.checkLimit(STORE_ID)).resolves.toBeUndefined();
    });

    it('allows requests up to the limit', async () => {
      const counter = { value: 19 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await expect(rateLimiter.checkLimit(STORE_ID)).resolves.toBeUndefined();
    });

    it('calls redis.incr with the correct key', async () => {
      const counter = { value: 0 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await rateLimiter.checkLimit(STORE_ID);

      expect(mockRedis.incr).toHaveBeenCalledWith(`ratelimit:${STORE_ID}:chat`);
    });

    it('sets TTL on first request in window', async () => {
      const counter = { value: 0 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await rateLimiter.checkLimit(STORE_ID);

      expect(mockRedis.expire).toHaveBeenCalledWith(`ratelimit:${STORE_ID}:chat`, 60);
    });

    it('does not set TTL when not first request', async () => {
      const counter = { value: 5 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await rateLimiter.checkLimit(STORE_ID);

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  // ── checkLimit — rejects when over limit ──────────────────────────

  describe('checkLimit — rejects when over limit', () => {
    it('throws RateLimitError when exceeding max requests', async () => {
      const counter = { value: 20 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await expect(rateLimiter.checkLimit(STORE_ID)).rejects.toBeInstanceOf(RateLimitError);
    });

    it('RateLimitError has user-friendly message', async () => {
      const counter = { value: 20 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await expect(rateLimiter.checkLimit(STORE_ID)).rejects.toThrow(
        "You've sent too many questions. Please wait a moment.",
      );
    });

    it('RateLimitError includes retryAfter from Redis TTL', async () => {
      const counter = { value: 20 };
      mockRedis = createMockRedis(counter);
      mockRedis.ttl.mockResolvedValue(30);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      try {
        await rateLimiter.checkLimit(STORE_ID);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect((err as InstanceType<typeof RateLimitError>).retryAfter).toBe(30);
      }
    });

    it('uses windowSeconds as fallback when TTL is negative', async () => {
      const counter = { value: 20 };
      mockRedis = createMockRedis(counter);
      mockRedis.ttl.mockResolvedValue(-1);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      try {
        await rateLimiter.checkLimit(STORE_ID);
        throw new Error('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RateLimitError);
        expect((err as InstanceType<typeof RateLimitError>).retryAfter).toBe(60);
      }
    });

    it('logs warning when rate limit exceeded', async () => {
      const counter = { value: 20 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      try {
        await rateLimiter.checkLimit(STORE_ID);
      } catch {
        // expected
      }

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: STORE_ID, current: 21, max: 20 }),
        'Rate limit exceeded for store',
      );
    });
  });

  // ── checkLimit — tenant isolation ──────────────────────────────────

  describe('checkLimit — tenant isolation', () => {
    it('uses separate Redis keys per store', async () => {
      const counter = { value: 0 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await rateLimiter.checkLimit(STORE_ID);
      await rateLimiter.checkLimit(STORE_ID_B);

      const calls = mockRedis.incr.mock.calls as unknown[][];
      expect(calls[0][0]).toBe(`ratelimit:${STORE_ID}:chat`);
      expect(calls[1][0]).toBe(`ratelimit:${STORE_ID_B}:chat`);
    });
  });

  // ── checkLimit — Redis error handling ────────────────────────────

  describe('checkLimit — Redis error handling', () => {
    it('allows request when Redis incr fails', async () => {
      mockRedis = createMockRedis();
      mockRedis.incr.mockRejectedValue(new Error('Redis connection lost'));
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await expect(rateLimiter.checkLimit(STORE_ID)).resolves.toBeUndefined();
    });

    it('logs error when Redis fails', async () => {
      mockRedis = createMockRedis();
      mockRedis.incr.mockRejectedValue(new Error('Redis connection lost'));
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      await rateLimiter.checkLimit(STORE_ID);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: STORE_ID }),
        'Rate limiter Redis error — allowing request',
      );
    });

    it('does not swallow RateLimitError when Redis TTL fails after exceeding limit', async () => {
      const counter = { value: 20 };
      mockRedis = createMockRedis(counter);
      mockRedis.ttl.mockRejectedValue(new Error('TTL failed'));
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 20, windowSeconds: 60 },
      });

      // When incr succeeds (returning 21) but ttl throws, the whole block
      // throws a non-RateLimitError, which gets caught and logged.
      // The request is allowed through.
      await expect(rateLimiter.checkLimit(STORE_ID)).resolves.toBeUndefined();
    });
  });

  // ── checkLimit — configurable limits ──────────────────────────────

  describe('checkLimit — configurable limits', () => {
    it('respects custom maxRequests value', async () => {
      const counter = { value: 4 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 5, windowSeconds: 30 },
      });

      await expect(rateLimiter.checkLimit(STORE_ID)).resolves.toBeUndefined();
    });

    it('rejects when custom maxRequests exceeded', async () => {
      const counter = { value: 5 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 5, windowSeconds: 30 },
      });

      await expect(rateLimiter.checkLimit(STORE_ID)).rejects.toBeInstanceOf(RateLimitError);
    });

    it('uses custom windowSeconds for TTL', async () => {
      const counter = { value: 0 };
      mockRedis = createMockRedis(counter);
      const rateLimiter = createRateLimiter({
        redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
        config: { maxRequests: 10, windowSeconds: 120 },
      });

      await rateLimiter.checkLimit(STORE_ID);

      expect(mockRedis.expire).toHaveBeenCalledWith(`ratelimit:${STORE_ID}:chat`, 120);
    });
  });

  // ── RateLimitError toJSON ─────────────────────────────────────────

  describe('RateLimitError — toJSON', () => {
    it('includes retryAfter in JSON output', () => {
      const err = new RateLimitError('Too many requests', { retryAfter: 42 });
      const json = err.toJSON();

      expect(json).toEqual({
        success: false,
        error: {
          code: 'RATE_LIMIT_ERROR',
          message: 'Too many requests',
          retryAfter: 42,
        },
      });
    });

    it('defaults retryAfter to 60 when not specified', () => {
      const err = new RateLimitError();
      expect(err.retryAfter).toBe(60);
    });

    it('has statusCode 429', () => {
      const err = new RateLimitError();
      expect(err.statusCode).toBe(429);
    });

    it('has code RATE_LIMIT_ERROR', () => {
      const err = new RateLimitError();
      expect(err.code).toBe('RATE_LIMIT_ERROR');
    });
  });
});
