import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mock logger ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');
const { RateLimitError, AIError, ValidationError } = await import('../../../src/utils/errors.js');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ─────────────────────────────────────────────────────────

async function buildApp(errorToThrow: Error): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  app.get('/test', async () => {
    throw errorToThrow;
  });

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('errorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── RateLimitError handling ─────────────────────────────────────

  describe('RateLimitError', () => {
    it('returns 429 status code', async () => {
      const app = await buildApp(new RateLimitError('Too many', { retryAfter: 30 }));

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(429);
    });

    it('sets Retry-After header', async () => {
      const app = await buildApp(new RateLimitError('Too many', { retryAfter: 30 }));

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.headers['retry-after']).toBe('30');
    });

    it('returns retryAfter in response body', async () => {
      const app = await buildApp(new RateLimitError('Too many', { retryAfter: 30 }));

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.body);

      expect(body.error.retryAfter).toBe(30);
    });

    it('returns RATE_LIMIT_ERROR code in response body', async () => {
      const app = await buildApp(new RateLimitError());

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.body);

      expect(body.error.code).toBe('RATE_LIMIT_ERROR');
    });

    it('returns success false', async () => {
      const app = await buildApp(new RateLimitError());

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.body);

      expect(body.success).toBe(false);
    });

    it('logs with retryAfter context', async () => {
      const app = await buildApp(new RateLimitError('Too many', { retryAfter: 15 }));

      await app.inject({ method: 'GET', url: '/test' });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ retryAfter: 15, code: 'RATE_LIMIT_ERROR' }),
        expect.stringContaining('Rate limit exceeded'),
      );
    });

    it('uses default retryAfter of 60 when not specified', async () => {
      const app = await buildApp(new RateLimitError());

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.headers['retry-after']).toBe('60');
    });
  });

  // ── AppError handling ───────────────────────────────────────────

  describe('AppError', () => {
    it('returns correct status code', async () => {
      const app = await buildApp(new AIError('AI failed'));

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(502);
    });

    it('returns error code and message', async () => {
      const app = await buildApp(new AIError('AI failed'));

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.body);

      expect(body.error.code).toBe('AI_ERROR');
      expect(body.error.message).toBe('AI failed');
    });

    it('handles ValidationError', async () => {
      const app = await buildApp(new ValidationError('Bad input'));

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── Unexpected errors ──────────────────────────────────────────

  describe('unexpected errors', () => {
    it('returns 500 for generic errors', async () => {
      const app = await buildApp(new Error('Something broke'));

      const response = await app.inject({ method: 'GET', url: '/test' });

      expect(response.statusCode).toBe(500);
    });

    it('returns INTERNAL_ERROR code', async () => {
      const app = await buildApp(new Error('Something broke'));

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.body);

      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    it('does not leak error details', async () => {
      const app = await buildApp(new Error('SECRET_DB_PASSWORD leaked'));

      const response = await app.inject({ method: 'GET', url: '/test' });
      const body = JSON.parse(response.body);

      expect(body.error.message).toBe('An unexpected error occurred');
      expect(body.error.message).not.toContain('SECRET');
    });

    it('logs unexpected errors at error level', async () => {
      const app = await buildApp(new Error('Crash'));

      await app.inject({ method: 'GET', url: '/test' });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('Unexpected error'),
      );
    });
  });

  // ── 404 handler ────────────────────────────────────────────────

  describe('not found handler', () => {
    it('returns 404 for unknown routes', async () => {
      const app = Fastify({ logger: false });
      registerErrorHandler(app);
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/nonexistent' });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
