import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { storeRoutes } from '../../../src/routes/stores.js';
import { registerErrorHandler } from '../../../src/middleware/errorHandler.js';

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
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

describe('GET /api/stores/onboarding-status', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  it('returns correct status when store has no synced data', async () => {
    const mockService = createMockStoreService();
    const mockDb = createMockDb({
      orders: 0,
      products: 0,
      customers: 0,
      categories: 0,
    });

    app = createApp('store-123');
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
    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(true);
    expect(body.data.hasSyncedData).toBe(false);
    expect(body.data.recordCounts).toEqual({
      orders: 0,
      products: 0,
      customers: 0,
      categories: 0,
    });
  });

  it('returns hasSyncedData true when store has orders', async () => {
    const mockService = createMockStoreService();
    const mockDb = createMockDb({
      orders: 150,
      products: 45,
      customers: 80,
      categories: 12,
    });

    app = createApp('store-456');
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
    expect(body.success).toBe(true);
    expect(body.data.connected).toBe(true);
    expect(body.data.hasSyncedData).toBe(true);
    expect(body.data.recordCounts).toEqual({
      orders: 150,
      products: 45,
      customers: 80,
      categories: 12,
    });
  });

  it('returns hasSyncedData true when only products are synced', async () => {
    const mockService = createMockStoreService();
    const mockDb = createMockDb({
      orders: 0,
      products: 10,
      customers: 0,
      categories: 0,
    });

    app = createApp('store-789');
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
    expect(body.data.recordCounts.products).toBe(10);
    expect(body.data.recordCounts.orders).toBe(0);
  });

  it('returns hasSyncedData true when only customers are synced', async () => {
    const mockService = createMockStoreService();
    const mockDb = createMockDb({
      orders: 0,
      products: 0,
      customers: 5,
      categories: 0,
    });

    app = createApp('store-abc');
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
    expect(body.data.recordCounts.customers).toBe(5);
  });

  it('returns hasSyncedData true when only categories are synced', async () => {
    const mockService = createMockStoreService();
    const mockDb = createMockDb({
      orders: 0,
      products: 0,
      customers: 0,
      categories: 4,
    });

    app = createApp('store-cat-only');
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
    expect(body.data.recordCounts.categories).toBe(4);
    expect(body.data.recordCounts.orders).toBe(0);
  });

  it('queries with correct store_id for tenant isolation', async () => {
    const mockService = createMockStoreService();

    // Track the where calls to verify store_id filtering
    const whereCalls: Array<Record<string, unknown>> = [];
    const mockDb = jest.fn(() => ({
      where: jest.fn((filter: Record<string, unknown>) => {
        whereCalls.push(filter);
        return {
          count: jest.fn().mockReturnValue({
            first: jest.fn<() => Promise<MockCountResult>>().mockResolvedValue({ count: '0' }),
          }),
        };
      }),
    }));

    app = createApp('store-tenant-check');
    await app.register(async (instance) =>
      storeRoutes(instance, { storeService: mockService as any, db: mockDb as any }), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    await app.ready();

    await app.inject({
      method: 'GET',
      url: '/api/stores/onboarding-status',
    });

    // Verify all 4 queries include store_id filter
    expect(whereCalls).toHaveLength(4);
    for (const call of whereCalls) {
      expect(call).toEqual({ store_id: 'store-tenant-check' });
    }
  });

  it('queries the correct tables', async () => {
    const mockService = createMockStoreService();

    const tableNames: string[] = [];
    const mockDb = jest.fn((table: string) => {
      tableNames.push(table);
      return {
        where: jest.fn().mockReturnValue({
          count: jest.fn().mockReturnValue({
            first: jest.fn<() => Promise<MockCountResult>>().mockResolvedValue({ count: '0' }),
          }),
        }),
      };
    });

    app = createApp('store-tables');
    await app.register(async (instance) =>
      storeRoutes(instance, { storeService: mockService as any, db: mockDb as any }), // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    await app.ready();

    await app.inject({
      method: 'GET',
      url: '/api/stores/onboarding-status',
    });

    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('customers');
    expect(tableNames).toContain('categories');
  });
});
