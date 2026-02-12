import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { storeRoutes } = await import('../../../src/routes/stores.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

function createMockStoreService() {
  return {
    connectStore: jest.fn<(opts: Record<string, unknown>) => Promise<{ storeId: string }>>().mockResolvedValue({
      storeId: 'new-store-uuid',
    }),
    getStoreById: jest.fn<() => Promise<Record<string, unknown>>>(),
    getStoreByUrl: jest.fn<() => Promise<Record<string, unknown> | undefined>>(),
    getActiveStores: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    verifyApiKey: jest.fn<() => Promise<Record<string, unknown> | null>>(),
    getStoreStatus: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
      storeId: STORE_ID,
      storeUrl: 'https://myshop.com',
      plan: 'free',
      connectedAt: '2026-01-01T00:00:00Z',
      lastSyncAt: null,
      isActive: true,
    }),
    disconnectStore: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

function createMockDb() {
  const mockDb = jest.fn(() => ({
    where: jest.fn().mockReturnValue({
      count: jest.fn().mockReturnValue({
        first: jest.fn<() => Promise<{ count: string }>>().mockResolvedValue({ count: '0' }),
      }),
    }),
  }));
  return mockDb as unknown;
}

async function buildApp(
  mockStoreService: ReturnType<typeof createMockStoreService>,
  mockDb: unknown = createMockDb(),
  withAuth = true,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  if (withAuth) {
    app.decorateRequest('store', undefined);
    app.addHook('onRequest', async (request) => {
      request.store = {
        id: STORE_ID,
        store_url: 'https://myshop.com',
        plan: 'free',
        is_active: true,
      };
    });
  }

  await app.register(async (instance) =>
    storeRoutes(instance, {
      storeService: mockStoreService as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      db: mockDb as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/stores/connect', () => {
  let app: FastifyInstance;
  let mockStoreService: ReturnType<typeof createMockStoreService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStoreService = createMockStoreService();
    app = await buildApp(mockStoreService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 201 with success response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stores/connect',
      payload: {
        storeUrl: 'https://example.com',
        apiKey: 'a'.repeat(32),
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.storeId).toBe('new-store-uuid');
  });

  it('passes storeUrl and apiKey to connectStore', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/stores/connect',
      payload: {
        storeUrl: 'https://example.com',
        apiKey: 'b'.repeat(32),
        wcVersion: '8.0.0',
      },
    });

    expect(mockStoreService.connectStore).toHaveBeenCalledWith({
      storeUrl: 'https://example.com',
      apiKey: 'b'.repeat(32),
      wcVersion: '8.0.0',
    });
  });

  it('returns 400 when storeUrl is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stores/connect',
      payload: {
        apiKey: 'a'.repeat(32),
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when apiKey is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stores/connect',
      payload: {
        storeUrl: 'https://example.com',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when apiKey is too short (< 32 chars)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stores/connect',
      payload: {
        storeUrl: 'https://example.com',
        apiKey: 'short',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('accepts apiKey at exactly 32 characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stores/connect',
      payload: {
        storeUrl: 'https://example.com',
        apiKey: 'x'.repeat(32),
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('does not call connectStore when validation fails', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/stores/connect',
      payload: {},
    });

    expect(mockStoreService.connectStore).not.toHaveBeenCalled();
  });

  it('returns 500 when connectStore throws', async () => {
    mockStoreService.connectStore.mockRejectedValue(new Error('DB error'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/stores/connect',
      payload: {
        storeUrl: 'https://example.com',
        apiKey: 'a'.repeat(32),
      },
    });

    expect(response.statusCode).toBe(500);
  });
});

// ── GET /api/stores/status ──────────────────────────────────────────

describe('GET /api/stores/status', () => {
  let app: FastifyInstance;
  let mockStoreService: ReturnType<typeof createMockStoreService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStoreService = createMockStoreService();
    app = await buildApp(mockStoreService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 200 with store status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/status',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.storeId).toBe(STORE_ID);
  });

  it('passes store.id to getStoreStatus', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/stores/status',
    });

    expect(mockStoreService.getStoreStatus).toHaveBeenCalledWith(STORE_ID);
  });

  it('returns data from storeService.getStoreStatus', async () => {
    mockStoreService.getStoreStatus.mockResolvedValue({
      storeId: STORE_ID,
      storeUrl: 'https://myshop.com',
      plan: 'pro',
      connectedAt: '2026-01-01T00:00:00Z',
      lastSyncAt: '2026-01-15T12:00:00Z',
      isActive: true,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/status',
    });

    const body = JSON.parse(response.body);
    expect(body.data.plan).toBe('pro');
    expect(body.data.lastSyncAt).toBe('2026-01-15T12:00:00Z');
  });

  it('returns 500 when getStoreStatus throws', async () => {
    mockStoreService.getStoreStatus.mockRejectedValue(new Error('Not found'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/status',
    });

    expect(response.statusCode).toBe(500);
  });
});

// ── DELETE /api/stores/disconnect ───────────────────────────────────

describe('DELETE /api/stores/disconnect', () => {
  let app: FastifyInstance;
  let mockStoreService: ReturnType<typeof createMockStoreService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStoreService = createMockStoreService();
    app = await buildApp(mockStoreService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns 200 with success message', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/stores/disconnect',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Store disconnected and all data deleted.');
  });

  it('passes store.id to disconnectStore', async () => {
    await app.inject({
      method: 'DELETE',
      url: '/api/stores/disconnect',
    });

    expect(mockStoreService.disconnectStore).toHaveBeenCalledWith(STORE_ID);
  });

  it('returns 500 when disconnectStore throws', async () => {
    mockStoreService.disconnectStore.mockRejectedValue(new Error('DB error'));

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/stores/disconnect',
    });

    expect(response.statusCode).toBe(500);
  });

  it('returns 404 for POST method on disconnect', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/stores/disconnect',
      payload: {},
    });

    expect(response.statusCode).toBe(404);
  });
});
