import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { storeRoutes } from '../../src/routes/stores.js';
import { registerErrorHandler } from '../../src/middleware/errorHandler.js';

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function createMockStoreService() {
  return {
    connectStore: jest.fn<() => Promise<{ storeId: string }>>().mockResolvedValue({
      storeId: 'new-store-uuid',
    }),
    getStoreById: jest.fn<() => Promise<Record<string, unknown>>>(),
    getStoreByUrl: jest.fn<() => Promise<Record<string, unknown> | undefined>>(),
    getActiveStores: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    verifyApiKey: jest.fn<() => Promise<Record<string, unknown> | null>>(),
    getStoreStatus: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
      storeId: 'store-123',
      storeUrl: 'https://myshop.com',
      plan: 'free',
      connectedAt: '2026-01-01T00:00:00Z',
      lastSyncAt: null,
      isActive: true,
    }),
    disconnectStore: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

interface MockCountResult {
  count: string;
}

function createMockDb(counts: { orders: number; products: number; customers: number; categories: number }) {
  const mockWhere = (table: string) => ({
    count: jest.fn().mockReturnValue({
      first: jest.fn<() => Promise<MockCountResult>>().mockResolvedValue({
        count: String(counts[table as keyof typeof counts] ?? 0),
      }),
    }),
  });

  const db = jest.fn((table: string) => ({
    where: jest.fn().mockReturnValue(mockWhere(table)),
  }));

  return db as unknown;
}

function createApp(storeId: string) {
  const app = Fastify();
  registerErrorHandler(app);

  app.decorateRequest('store', undefined);
  app.addHook('onRequest', async (request) => {
    request.store = {
      id: storeId,
      store_url: 'https://myshop.com',
      plan: 'free',
      is_active: true,
    };
  });

  return app;
}

describe('Onboarding Status Integration', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  it('returns 200 with onboarding status for authenticated store with data', async () => {
    const mockService = createMockStoreService();
    const mockDb = createMockDb({
      orders: 100,
      products: 30,
      customers: 50,
      categories: 8,
    });

    app = createApp('store-integration');
    await app.register(async (instance) =>
      storeRoutes(instance, { storeService: mockService as any, db: mockDb as any }), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/onboarding-status',
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        connected: true,
        hasSyncedData: true,
        recordCounts: {
          orders: 100,
          products: 30,
          customers: 50,
          categories: 8,
        },
      },
    });
  });

  it('returns 200 with hasSyncedData false for empty store', async () => {
    const mockService = createMockStoreService();
    const mockDb = createMockDb({
      orders: 0,
      products: 0,
      customers: 0,
      categories: 0,
    });

    app = createApp('store-empty');
    await app.register(async (instance) =>
      storeRoutes(instance, { storeService: mockService as any, db: mockDb as any }), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/onboarding-status',
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.data.connected).toBe(true);
    expect(body.data.hasSyncedData).toBe(false);
    expect(body.data.recordCounts.orders).toBe(0);
  });

  it('returns consistent data structure for partial sync', async () => {
    const mockService = createMockStoreService();
    const mockDb = createMockDb({
      orders: 25,
      products: 0,
      customers: 0,
      categories: 3,
    });

    app = createApp('store-partial');
    await app.register(async (instance) =>
      storeRoutes(instance, { storeService: mockService as any, db: mockDb as any }), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/stores/onboarding-status',
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.data.hasSyncedData).toBe(true);
    expect(body.data.recordCounts.orders).toBe(25);
    expect(body.data.recordCounts.products).toBe(0);
    expect(body.data.recordCounts.customers).toBe(0);
    expect(body.data.recordCounts.categories).toBe(3);
  });

  it('coexists with existing store routes', async () => {
    const mockService = createMockStoreService();
    const mockDb = createMockDb({
      orders: 5,
      products: 5,
      customers: 5,
      categories: 5,
    });

    app = createApp('store-coexist');
    await app.register(async (instance) =>
      storeRoutes(instance, { storeService: mockService as any, db: mockDb as any }), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    await app.ready();

    // Check both endpoints work
    const onboardingResponse = await app.inject({
      method: 'GET',
      url: '/api/stores/onboarding-status',
    });
    expect(onboardingResponse.statusCode).toBe(200);

    const statusResponse = await app.inject({
      method: 'GET',
      url: '/api/stores/status',
    });
    expect(statusResponse.statusCode).toBe(200);
  });
});
