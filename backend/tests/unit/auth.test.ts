import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerErrorHandler } from '../../src/middleware/errorHandler.js';

// ESM-compatible mocks — must be set up BEFORE dynamic import
const mockCompare = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

jest.unstable_mockModule('bcrypt', () => ({
  default: { compare: mockCompare },
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Dynamic import AFTER mocks are set up
const { registerAuthMiddleware } = await import('../../src/middleware/auth.js');

interface MockQueryBuilder {
  where: jest.Mock;
  first: jest.Mock<() => Promise<unknown>>;
}

function createMockDb(store?: Record<string, unknown>) {
  const mockQueryBuilder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    first: jest.fn<() => Promise<unknown>>().mockResolvedValue(store),
  };
  const db = jest.fn().mockReturnValue(mockQueryBuilder);
  return { db: db as any, mockQueryBuilder }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function encodeToken(storeUrl: string, apiKey: string): string {
  return Buffer.from(`${storeUrl}:${apiKey}`).toString('base64');
}

describe('Auth Middleware', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
    mockCompare.mockResolvedValue(true);
  });

  it('skips auth for /health endpoint', async () => {
    const { db } = createMockDb();
    app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, { db });

    app.get('/health', async () => ({ status: 'ok' }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('skips auth for /api/stores/connect endpoint', async () => {
    const { db } = createMockDb();
    app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, { db });

    app.post('/api/stores/connect', async () => ({ success: true }));
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/stores/connect',
      payload: {},
    });
    expect(response.statusCode).toBe(200);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { db } = createMockDb();
    app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, { db });

    app.get('/api/stores/status', async () => ({ success: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/stores/status' });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_ERROR');
  });

  it('returns 401 when Authorization header is not Bearer', async () => {
    const { db } = createMockDb();
    app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, { db });

    app.get('/api/stores/status', async () => ({ success: true }));
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/status',
      headers: { authorization: 'Basic abc123' },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.error.code).toBe('AUTH_ERROR');
  });

  it('returns 401 when token format is invalid (not base64 encoded)', async () => {
    const { db } = createMockDb();
    app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, { db });

    app.get('/api/stores/status', async () => ({ success: true }));
    await app.ready();

    // Token that decodes but has no colon separator
    const invalidToken = Buffer.from('nocolonseparator').toString('base64');
    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/status',
      headers: { authorization: `Bearer ${invalidToken}` },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.error.code).toBe('AUTH_ERROR');
  });

  it('returns 401 when store is not found', async () => {
    const { db } = createMockDb(undefined);
    app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, { db });

    app.get('/api/stores/status', async () => ({ success: true }));
    await app.ready();

    const token = encodeToken('https://unknown.com', 'someapikey');
    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/status',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.error.code).toBe('AUTH_ERROR');
    expect(body.error.message).toBe('Store not found or inactive');
  });

  it('returns 401 when API key is invalid', async () => {
    const mockStore = {
      id: 'store-123',
      store_url: 'https://myshop.com',
      api_key_hash: '$2b$12$hashedvalue',
      plan: 'free',
      is_active: true,
    };
    const { db } = createMockDb(mockStore);
    mockCompare.mockResolvedValueOnce(false);

    app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, { db });

    app.get('/api/stores/status', async () => ({ success: true }));
    await app.ready();

    const token = encodeToken('https://myshop.com', 'wrongapikey');
    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/status',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.error.code).toBe('AUTH_ERROR');
    expect(body.error.message).toBe('Invalid API key');
  });

  it('attaches store to request when authentication succeeds', async () => {
    const mockStore = {
      id: 'store-123',
      store_url: 'https://myshop.com',
      api_key_hash: '$2b$12$hashedvalue',
      plan: 'free',
      is_active: true,
    };
    const { db } = createMockDb(mockStore);
    mockCompare.mockResolvedValueOnce(true);

    app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, { db });

    app.get('/api/stores/status', async (request) => {
      return {
        success: true,
        store: request.store,
      };
    });
    await app.ready();

    const token = encodeToken('https://myshop.com', 'validapikey');
    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/status',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.store).toEqual({
      id: 'store-123',
      store_url: 'https://myshop.com',
      plan: 'free',
      is_active: true,
    });
  });

  it('skips auth for non-api routes', async () => {
    const { db } = createMockDb();
    app = Fastify();
    registerErrorHandler(app);
    registerAuthMiddleware(app, { db });

    app.get('/some-other-path', async () => ({ ok: true }));
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/some-other-path' });
    expect(response.statusCode).toBe(200);
  });
});
