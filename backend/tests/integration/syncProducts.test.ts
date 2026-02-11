import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { syncProductsRoutes } from '../../src/routes/sync/products.js';
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
    upsertProducts: jest.fn<(storeId: string, products: unknown[]) => Promise<{ syncedCount: number; skippedCount: number; syncLogId: string }>>().mockResolvedValue({
      syncedCount: 1,
      skippedCount: 0,
      syncLogId: 'sync-log-uuid',
    }),
  };
}

function makeValidProduct(overrides: Record<string, unknown> = {}) {
  return {
    wc_product_id: 501,
    name: 'Blue Widget',
    sku: 'BW-001',
    price: 24.99,
    regular_price: 29.99,
    sale_price: 24.99,
    stock_quantity: 50,
    stock_status: 'instock',
    status: 'publish',
    type: 'simple',
    ...overrides,
  };
}

async function buildApp(mockService: ReturnType<typeof createMockSyncService>) {
  const app = Fastify();
  registerErrorHandler(app);

  app.decorateRequest('store', undefined);
  app.addHook('onRequest', async (request) => {
    request.store = {
      id: 'store-123',
      store_url: 'https://myshop.com',
      plan: 'free',
      is_active: true,
    };
  });

  await app.register(async (instance) => syncProductsRoutes(instance, { syncService: mockService as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
  await app.ready();
  return app;
}

describe('Sync Products Routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  describe('POST /api/sync/products', () => {
    it('returns 200 with sync result on successful batch', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: [makeValidProduct()] },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(1);
      expect(body.data.skippedCount).toBe(0);
      expect(body.data.syncLogId).toBe('sync-log-uuid');
      expect(mockService.upsertProducts).toHaveBeenCalledWith('store-123', [makeValidProduct()]);
    });

    it('returns 200 with empty products array', async () => {
      const mockService = createMockSyncService();
      mockService.upsertProducts.mockResolvedValueOnce({
        syncedCount: 0,
        skippedCount: 0,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: [] },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(0);
    });

    it('returns 400 when products field is missing', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: {},
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when products is not an array', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: 'not-an-array' },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when a product is missing required fields', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: {
          products: [
            makeValidProduct(),
            { sku: 'MISSING-FIELDS' }, // invalid, missing wc_product_id and name
          ],
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 200 with partial success when service reports skipped products', async () => {
      const mockService = createMockSyncService();
      mockService.upsertProducts.mockResolvedValueOnce({
        syncedCount: 1,
        skippedCount: 1,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: {
          products: [
            makeValidProduct(),
            makeValidProduct({ wc_product_id: 502 }),
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
      mockService.upsertProducts.mockRejectedValueOnce(new SyncError('Failed to upsert products'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: [makeValidProduct()] },
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
        url: '/api/sync/products',
        payload: { products: [makeValidProduct()] },
      });

      expect(mockService.upsertProducts).toHaveBeenCalledWith(
        'store-123',
        expect.any(Array),
      );
    });

    it('returns 400 when body has wrong type for products field', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: 123 },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('handles large batch payload', async () => {
      const mockService = createMockSyncService();
      mockService.upsertProducts.mockResolvedValueOnce({
        syncedCount: 100,
        skippedCount: 0,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const products = Array.from({ length: 100 }, (_, i) =>
        makeValidProduct({ wc_product_id: i + 1 }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.syncedCount).toBe(100);
    });
  });
});
