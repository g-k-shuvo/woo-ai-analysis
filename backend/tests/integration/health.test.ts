import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { healthRoutes } from '../../src/routes/health.js';

function createMockDb(connected: boolean) {
  return {
    raw: connected
      ? jest.fn<() => Promise<unknown>>().mockResolvedValue({ rows: [{ '?column?': 1 }] })
      : jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('Connection refused')),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function createMockRedis(connected: boolean) {
  return {
    ping: connected
      ? jest.fn<() => Promise<string>>().mockResolvedValue('PONG')
      : jest.fn<() => Promise<string>>().mockRejectedValue(new Error('Connection refused')),
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('GET /health', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 200 when db and redis are connected', async () => {
    app = Fastify();
    await app.register(async (instance) =>
      healthRoutes(instance, {
        db: createMockDb(true),
        redis: createMockRedis(true),
        startTime: Date.now() - 5000,
      }),
    );
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(body.db).toBe('connected');
    expect(body.redis).toBe('connected');
    expect(typeof body.uptime).toBe('number');
  });

  it('returns 503 when db is disconnected', async () => {
    app = Fastify();
    await app.register(async (instance) =>
      healthRoutes(instance, {
        db: createMockDb(false),
        redis: createMockRedis(true),
        startTime: Date.now(),
      }),
    );
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('disconnected');
    expect(body.redis).toBe('connected');
  });

  it('returns 503 when redis is disconnected', async () => {
    app = Fastify();
    await app.register(async (instance) =>
      healthRoutes(instance, {
        db: createMockDb(true),
        redis: createMockRedis(false),
        startTime: Date.now(),
      }),
    );
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('connected');
    expect(body.redis).toBe('disconnected');
  });
});
