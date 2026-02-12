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

const { syncProductsRoutes } = await import('../../../src/routes/sync/products.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

interface MockSyncService {
  upsertProducts: jest.Mock<(storeId: string, products: unknown[]) => Promise<{ upserted: number }>>;
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    wc_product_id: 101,
    name: 'Test Product',
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
    syncProductsRoutes(instance, {
      syncService: mockSyncService as unknown as Parameters<typeof syncProductsRoutes>[1]['syncService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/sync/products', () => {
  let app: FastifyInstance;
  let mockSyncService: MockSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncService = {
      upsertProducts: jest.fn<(storeId: string, products: unknown[]) => Promise<{ upserted: number }>>()
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
        url: '/api/sync/products',
        payload: { products: [makeProduct()] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('returns data from syncService.upsertProducts', async () => {
      mockSyncService.upsertProducts.mockResolvedValue({ upserted: 10 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: [makeProduct()] },
      });

      const body = JSON.parse(response.body);
      expect(body.data.upserted).toBe(10);
    });

    it('passes storeId and products to upsertProducts', async () => {
      const product = makeProduct({ wc_product_id: 202 });

      await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: [product] },
      });

      expect(mockSyncService.upsertProducts).toHaveBeenCalledWith(STORE_ID, [product]);
    });

    it('accepts empty products array and calls upsertProducts with it', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: [] },
      });

      expect(response.statusCode).toBe(200);
      expect(mockSyncService.upsertProducts).toHaveBeenCalledWith(STORE_ID, []);
    });
  });

  describe('validation', () => {
    it('returns 400 when products field is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when products is not an array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: 'not-array' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when product is missing required wc_product_id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: [{ name: 'No ID' }] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when product is missing required name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: [{ wc_product_id: 1 }] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('does not call upsertProducts when validation fails', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: {},
      });

      expect(mockSyncService.upsertProducts).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 when upsertProducts throws', async () => {
      mockSyncService.upsertProducts.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/products',
        payload: { products: [makeProduct()] },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('route configuration', () => {
    it('returns 404 for GET method', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/products' });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/sync/products' });
      expect(response.statusCode).toBe(404);
    });
  });
});
