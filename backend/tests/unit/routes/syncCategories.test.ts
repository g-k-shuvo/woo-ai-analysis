import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mock logger ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { syncCategoriesRoutes } = await import('../../../src/routes/sync/categories.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

interface MockSyncService {
  upsertCategories: jest.Mock<(storeId: string, categories: unknown[]) => Promise<{ upserted: number }>>;
}

function makeCategory(overrides: Record<string, unknown> = {}) {
  return {
    wc_category_id: 10,
    name: 'Test Category',
    ...overrides,
  };
}

async function buildApp(mockSyncService: MockSyncService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  app.decorateRequest('store', undefined);
  app.addHook('onRequest', async (request) => {
    request.store = {
      id: STORE_ID,
      store_url: 'https://example.com',
      plan: 'free',
      is_active: true,
    };
  });

  await app.register(async (instance) =>
    syncCategoriesRoutes(instance, {
      syncService: mockSyncService as unknown as Parameters<typeof syncCategoriesRoutes>[1]['syncService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/sync/categories', () => {
  let app: FastifyInstance;
  let mockSyncService: MockSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncService = {
      upsertCategories: jest.fn<(storeId: string, categories: unknown[]) => Promise<{ upserted: number }>>()
        .mockResolvedValue({ upserted: 1 }),
    };
    app = await buildApp(mockSyncService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('successful sync', () => {
    it('returns 200 with success response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [makeCategory()] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('returns data from syncService.upsertCategories', async () => {
      mockSyncService.upsertCategories.mockResolvedValue({ upserted: 8 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [makeCategory()] },
      });

      const body = JSON.parse(response.body);
      expect(body.data.upserted).toBe(8);
    });

    it('passes storeId and categories to upsertCategories', async () => {
      const category = makeCategory({ wc_category_id: 20 });

      await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [category] },
      });

      expect(mockSyncService.upsertCategories).toHaveBeenCalledWith(STORE_ID, [category]);
    });

    it('accepts empty categories array and calls upsertCategories with it', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [] },
      });

      expect(response.statusCode).toBe(200);
      expect(mockSyncService.upsertCategories).toHaveBeenCalledWith(STORE_ID, []);
    });
  });

  describe('validation', () => {
    it('returns 400 when categories field is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when categories is not an array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: 'not-array' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when category is missing required wc_category_id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [{ name: 'No ID' }] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when category is missing required name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [{ wc_category_id: 1 }] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('does not call upsertCategories when validation fails', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: {},
      });

      expect(mockSyncService.upsertCategories).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 when upsertCategories throws', async () => {
      mockSyncService.upsertCategories.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/categories',
        payload: { categories: [makeCategory()] },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('route configuration', () => {
    it('returns 404 for GET method', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/categories' });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/sync/categories' });
      expect(response.statusCode).toBe(404);
    });
  });
});
