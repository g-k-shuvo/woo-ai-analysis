import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { syncCategoriesRoutes } from '../../src/routes/sync/categories.js';
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
    upsertCategories: jest.fn<(storeId: string, categories: unknown[]) => Promise<{ syncedCount: number; skippedCount: number; syncLogId: string }>>().mockResolvedValue({
      syncedCount: 1,
      skippedCount: 0,
      syncLogId: 'sync-log-uuid',
    }),
  };
}

function makeValidCategory(overrides: Record<string, unknown> = {}) {
  return {
    wc_category_id: 10,
    name: 'Widgets',
    product_count: 25,
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

  await app.register(async (instance) => syncCategoriesRoutes(instance, { syncService: mockService as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
  await app.ready();
  return app;
}

describe('Sync Categories Routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  describe('POST /api/sync/categories', () => {
    it('returns 200 with sync result on successful batch', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [makeValidCategory()] },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(1);
      expect(body.data.skippedCount).toBe(0);
      expect(body.data.syncLogId).toBe('sync-log-uuid');
      expect(mockService.upsertCategories).toHaveBeenCalledWith('store-123', [makeValidCategory()]);
    });

    it('returns 200 with empty categories array', async () => {
      const mockService = createMockSyncService();
      mockService.upsertCategories.mockResolvedValueOnce({
        syncedCount: 0,
        skippedCount: 0,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [] },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(0);
    });

    it('returns 400 when categories field is missing', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: {},
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when categories is not an array', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: 'not-an-array' },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when a category is missing required fields', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: {
          categories: [
            makeValidCategory(),
            { product_count: 5 }, // invalid, missing wc_category_id and name
          ],
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when a category has empty name', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: {
          categories: [{ wc_category_id: 10, name: '' }],
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 200 with partial success when service reports skipped categories', async () => {
      const mockService = createMockSyncService();
      mockService.upsertCategories.mockResolvedValueOnce({
        syncedCount: 1,
        skippedCount: 1,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: {
          categories: [
            makeValidCategory(),
            makeValidCategory({ wc_category_id: 11 }),
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
      mockService.upsertCategories.mockRejectedValueOnce(new SyncError('Failed to upsert categories'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [makeValidCategory()] },
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
        url: '/api/sync/categories',
        payload: { categories: [makeValidCategory()] },
      });

      expect(mockService.upsertCategories).toHaveBeenCalledWith(
        'store-123',
        expect.any(Array),
      );
    });

    it('returns 400 when body has wrong type for categories field', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: 123 },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('handles large batch payload', async () => {
      const mockService = createMockSyncService();
      mockService.upsertCategories.mockResolvedValueOnce({
        syncedCount: 100,
        skippedCount: 0,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const categories = Array.from({ length: 100 }, (_, i) =>
        makeValidCategory({ wc_category_id: i + 1 }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.syncedCount).toBe(100);
    });
  });
});
