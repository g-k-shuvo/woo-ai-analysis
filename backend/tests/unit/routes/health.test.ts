import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { healthRoutes } from '../../../src/routes/health.js';

// ── Helpers ─────────────────────────────────────────────────────────

interface MockDb {
  raw: jest.Mock<(sql: string) => Promise<unknown>>;
}

interface MockRedis {
  ping: jest.Mock<() => Promise<string>>;
}

function buildMocks() {
  const db: MockDb = {
    raw: jest.fn<(sql: string) => Promise<unknown>>().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  };
  const redis: MockRedis = {
    ping: jest.fn<() => Promise<string>>().mockResolvedValue('PONG'),
  };
  return { db, redis };
}

async function buildApp(
  db: MockDb,
  redis: MockRedis,
  startTime = Date.now() - 60_000,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(async (instance) =>
    healthRoutes(instance, {
      db: db as unknown as Parameters<typeof healthRoutes>[1]['db'],
      redis: redis as unknown as Parameters<typeof healthRoutes>[1]['redis'],
      startTime,
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('GET /health', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── Happy path (both healthy) ─────────────────────────────────

  describe('when both DB and Redis are healthy', () => {
    beforeEach(async () => {
      const { db, redis } = buildMocks();
      app = await buildApp(db, redis);
    });

    it('returns 200 status code', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    });

    it('returns status "ok"', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
    });

    it('returns version string', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.version).toBe('1.0.0');
    });

    it('returns db as connected', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.db).toBe('connected');
    });

    it('returns redis as connected', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.redis).toBe('connected');
    });

    it('returns uptime as a number', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ── DB disconnected ───────────────────────────────────────────

  describe('when DB is disconnected', () => {
    beforeEach(async () => {
      const { db, redis } = buildMocks();
      db.raw.mockRejectedValue(new Error('Connection refused'));
      app = await buildApp(db, redis);
    });

    it('returns 503 status code', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);
    });

    it('returns status "degraded"', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
    });

    it('returns db as disconnected', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.db).toBe('disconnected');
    });

    it('returns redis as connected', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.redis).toBe('connected');
    });
  });

  // ── Redis disconnected ────────────────────────────────────────

  describe('when Redis is disconnected', () => {
    beforeEach(async () => {
      const { db, redis } = buildMocks();
      redis.ping.mockRejectedValue(new Error('Connection refused'));
      app = await buildApp(db, redis);
    });

    it('returns 503 status code', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);
    });

    it('returns status "degraded"', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.status).toBe('degraded');
    });

    it('returns redis as disconnected', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.redis).toBe('disconnected');
    });

    it('returns db as connected', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);
      expect(body.db).toBe('connected');
    });
  });

  // ── Both disconnected ─────────────────────────────────────────

  describe('when both DB and Redis are disconnected', () => {
    it('returns 503 with both disconnected', async () => {
      const { db, redis } = buildMocks();
      db.raw.mockRejectedValue(new Error('DB down'));
      redis.ping.mockRejectedValue(new Error('Redis down'));
      app = await buildApp(db, redis);

      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(503);
      expect(body.status).toBe('degraded');
      expect(body.db).toBe('disconnected');
      expect(body.redis).toBe('disconnected');
    });
  });

  // ── Redis returns non-PONG ────────────────────────────────────

  describe('when Redis returns non-PONG response', () => {
    it('returns redis as disconnected', async () => {
      const { db, redis } = buildMocks();
      redis.ping.mockResolvedValue('NOT_PONG');
      app = await buildApp(db, redis);

      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(503);
      expect(body.redis).toBe('disconnected');
    });
  });

  // ── Uptime calculation ────────────────────────────────────────

  describe('uptime calculation', () => {
    it('calculates uptime from startTime', async () => {
      const { db, redis } = buildMocks();
      const startTime = Date.now() - 120_000; // 120 seconds ago
      app = await buildApp(db, redis, startTime);

      const response = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(response.body);

      // Should be approximately 120 seconds (±2s for test timing)
      expect(body.uptime).toBeGreaterThanOrEqual(118);
      expect(body.uptime).toBeLessThanOrEqual(122);
    });
  });

  // ── Route configuration ───────────────────────────────────────

  describe('route configuration', () => {
    beforeEach(async () => {
      const { db, redis } = buildMocks();
      app = await buildApp(db, redis);
    });

    it('responds to GET method', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    });

    it('returns 404 for POST method', async () => {
      const response = await app.inject({ method: 'POST', url: '/health', payload: {} });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for PUT method', async () => {
      const response = await app.inject({ method: 'PUT', url: '/health', payload: {} });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/health' });
      expect(response.statusCode).toBe(404);
    });
  });
});
