import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ESM-compatible mocks — must be set up BEFORE dynamic import
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Dynamic imports AFTER mocks are set up
const { syncWebhookRoutes } = await import('../../src/routes/sync/webhook.js');
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');

function createMockSyncService() {
  return {
    upsertOrders: jest.fn<(storeId: string, orders: unknown[], syncType?: string) => Promise<{ syncedCount: number; skippedCount: number; syncLogId: string }>>().mockResolvedValue({
      syncedCount: 1,
      skippedCount: 0,
      syncLogId: 'sync-log-uuid',
    }),
    upsertProducts: jest.fn<(storeId: string, products: unknown[], syncType?: string) => Promise<{ syncedCount: number; skippedCount: number; syncLogId: string }>>().mockResolvedValue({
      syncedCount: 1,
      skippedCount: 0,
      syncLogId: 'sync-log-uuid',
    }),
    upsertCustomers: jest.fn<(storeId: string, customers: unknown[], syncType?: string) => Promise<{ syncedCount: number; skippedCount: number; syncLogId: string }>>().mockResolvedValue({
      syncedCount: 1,
      skippedCount: 0,
      syncLogId: 'sync-log-uuid',
    }),
    upsertCategories: jest.fn<(storeId: string, categories: unknown[], syncType?: string) => Promise<{ syncedCount: number; skippedCount: number; syncLogId: string }>>().mockResolvedValue({
      syncedCount: 1,
      skippedCount: 0,
      syncLogId: 'sync-log-uuid',
    }),
  };
}

function makeOrderData(overrides: Record<string, unknown> = {}) {
  return {
    wc_order_id: 1001,
    date_created: '2026-01-15T10:30:00Z',
    status: 'completed',
    total: 99.99,
    items: [
      {
        product_name: 'Blue Widget',
        sku: 'BW-001',
        quantity: 2,
        subtotal: 44.99,
        total: 49.99,
      },
    ],
    ...overrides,
  };
}

function makeProductData(overrides: Record<string, unknown> = {}) {
  return {
    wc_product_id: 501,
    name: 'Blue Widget',
    sku: 'BW-001',
    price: 24.99,
    status: 'publish',
    type: 'simple',
    ...overrides,
  };
}

function makeCustomerData(overrides: Record<string, unknown> = {}) {
  return {
    wc_customer_id: 42,
    email_hash: 'abc123hash',
    display_name: 'Test User',
    total_spent: 199.99,
    order_count: 5,
    ...overrides,
  };
}

function makeCategoryData(overrides: Record<string, unknown> = {}) {
  return {
    wc_category_id: 10,
    name: 'Electronics',
    parent_id: 0,
    product_count: 15,
    ...overrides,
  };
}

async function buildApp(mockService: ReturnType<typeof createMockSyncService>) {
  const app = Fastify();
  registerErrorHandler(app);

  // Simulate auth middleware by decorating request with store
  app.decorateRequest('store', undefined);
  app.addHook('onRequest', async (request) => {
    request.store = {
      id: 'store-123',
      store_url: 'https://myshop.com',
      plan: 'free',
      is_active: true,
    };
  });

  await app.register(async (instance) => syncWebhookRoutes(instance, { syncService: mockService as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
  await app.ready();
  return app;
}

describe('Sync Webhook Routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  describe('POST /api/sync/webhook', () => {
    it('returns 200 for valid order created event', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'order',
          action: 'created',
          data: makeOrderData(),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(1);
      expect(body.data.syncLogId).toBe('sync-log-uuid');
      expect(mockService.upsertOrders).toHaveBeenCalledWith(
        'store-123',
        [makeOrderData()],
        'webhook:orders',
      );
    });

    it('returns 200 for valid order updated event', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'order',
          action: 'updated',
          data: makeOrderData({ status: 'processing' }),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(mockService.upsertOrders).toHaveBeenCalledWith(
        'store-123',
        [makeOrderData({ status: 'processing' })],
        'webhook:orders',
      );
    });

    it('returns 200 for valid product created event', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'product',
          action: 'created',
          data: makeProductData(),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(mockService.upsertProducts).toHaveBeenCalledWith(
        'store-123',
        [makeProductData()],
        'webhook:products',
      );
    });

    it('returns 200 for valid product updated event', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'product',
          action: 'updated',
          data: makeProductData({ price: 29.99 }),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(mockService.upsertProducts).toHaveBeenCalledWith(
        'store-123',
        [makeProductData({ price: 29.99 })],
        'webhook:products',
      );
    });

    it('returns 200 for valid customer created event', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'customer',
          action: 'created',
          data: makeCustomerData(),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(mockService.upsertCustomers).toHaveBeenCalledWith(
        'store-123',
        [makeCustomerData()],
        'webhook:customers',
      );
    });

    it('returns 200 for valid category updated event', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'category',
          action: 'updated',
          data: makeCategoryData(),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(mockService.upsertCategories).toHaveBeenCalledWith(
        'store-123',
        [makeCategoryData()],
        'webhook:categories',
      );
    });

    it('returns 400 for invalid resource type', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'coupon',
          action: 'created',
          data: { wc_coupon_id: 1 },
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing resource field', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          action: 'created',
          data: makeOrderData(),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing action field', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'order',
          data: makeOrderData(),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for missing data field', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'order',
          action: 'created',
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for invalid action type', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'order',
          action: 'deleted',
          data: makeOrderData(),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 500 when sync service throws SyncError', async () => {
      const mockService = createMockSyncService();
      const { SyncError } = await import('../../src/utils/errors.js');
      mockService.upsertOrders.mockRejectedValueOnce(new SyncError('Failed to upsert orders'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'order',
          action: 'created',
          data: makeOrderData(),
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('SYNC_ERROR');
    });

    it('passes store.id from auth context to syncService', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'order',
          action: 'created',
          data: makeOrderData(),
        },
      });

      expect(mockService.upsertOrders).toHaveBeenCalledWith(
        'store-123',
        expect.any(Array),
        'webhook:orders',
      );
    });

    it('wraps single entity data in an array before calling service', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const orderData = makeOrderData();
      await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'order',
          action: 'created',
          data: orderData,
        },
      });

      // The first argument to upsertOrders after storeId should be an array with exactly 1 item
      const callArgs = mockService.upsertOrders.mock.calls[0];
      expect(callArgs[1]).toHaveLength(1);
      expect(callArgs[1][0]).toEqual(orderData);
    });

    it('returns 400 when body is empty', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {},
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
