import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { syncOrdersRoutes } from '../../src/routes/sync/orders.js';
import { registerErrorHandler } from '../../src/middleware/errorHandler.js';

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function createMockSyncService() {
  return {
    upsertOrders: jest.fn<() => Promise<{ syncedCount: number; skippedCount: number; syncLogId: string }>>().mockResolvedValue({
      syncedCount: 1,
      skippedCount: 0,
      syncLogId: 'sync-log-uuid',
    }),
  };
}

function makeValidOrder(overrides: Record<string, unknown> = {}) {
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

  await app.register(async (instance) => syncOrdersRoutes(instance, { syncService: mockService as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
  await app.ready();
  return app;
}

describe('Sync Orders Routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  describe('POST /api/sync/orders', () => {
    it('returns 200 with sync result on successful batch', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [makeValidOrder()] },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(1);
      expect(body.data.skippedCount).toBe(0);
      expect(body.data.syncLogId).toBe('sync-log-uuid');
      expect(mockService.upsertOrders).toHaveBeenCalledWith('store-123', [makeValidOrder()]);
    });

    it('returns 200 with empty orders array', async () => {
      const mockService = createMockSyncService();
      mockService.upsertOrders.mockResolvedValueOnce({
        syncedCount: 0,
        skippedCount: 0,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [] },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(0);
    });

    it('returns 400 when orders field is missing', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: {},
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when orders is not an array', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: 'not-an-array' },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 200 with partial success (some invalid orders)', async () => {
      const mockService = createMockSyncService();
      mockService.upsertOrders.mockResolvedValueOnce({
        syncedCount: 1,
        skippedCount: 1,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: {
          orders: [
            makeValidOrder(),
            { status: 'incomplete' }, // invalid, missing required fields
          ],
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(1);
      expect(body.data.skippedCount).toBe(1);
    });

    it('returns 500 when sync service throws SyncError', async () => {
      const mockService = createMockSyncService();
      const { SyncError } = await import('../../src/utils/errors.js');
      mockService.upsertOrders.mockRejectedValueOnce(new SyncError('Failed to upsert orders'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [makeValidOrder()] },
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
        url: '/api/sync/orders',
        payload: { orders: [makeValidOrder()] },
      });

      expect(mockService.upsertOrders).toHaveBeenCalledWith(
        'store-123',
        expect.any(Array),
      );
    });

    it('returns 400 when body has wrong type for orders field', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: 123 },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('handles large batch payload', async () => {
      const mockService = createMockSyncService();
      mockService.upsertOrders.mockResolvedValueOnce({
        syncedCount: 100,
        skippedCount: 0,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const orders = Array.from({ length: 100 }, (_, i) =>
        makeValidOrder({ wc_order_id: i + 1 }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.syncedCount).toBe(100);
    });
  });
});
