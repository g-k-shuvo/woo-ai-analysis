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

const { syncWebhookRoutes } = await import('../../../src/routes/sync/webhook.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

interface MockSyncService {
  upsertOrders: jest.Mock<(storeId: string, data: unknown[], syncType: string) => Promise<{ upserted: number }>>;
  upsertProducts: jest.Mock<(storeId: string, data: unknown[], syncType: string) => Promise<{ upserted: number }>>;
  upsertCustomers: jest.Mock<(storeId: string, data: unknown[], syncType: string) => Promise<{ upserted: number }>>;
  upsertCategories: jest.Mock<(storeId: string, data: unknown[], syncType: string) => Promise<{ upserted: number }>>;
}

function createMockSyncService(): MockSyncService {
  return {
    upsertOrders: jest.fn<(storeId: string, data: unknown[], syncType: string) => Promise<{ upserted: number }>>()
      .mockResolvedValue({ upserted: 1 }),
    upsertProducts: jest.fn<(storeId: string, data: unknown[], syncType: string) => Promise<{ upserted: number }>>()
      .mockResolvedValue({ upserted: 1 }),
    upsertCustomers: jest.fn<(storeId: string, data: unknown[], syncType: string) => Promise<{ upserted: number }>>()
      .mockResolvedValue({ upserted: 1 }),
    upsertCategories: jest.fn<(storeId: string, data: unknown[], syncType: string) => Promise<{ upserted: number }>>()
      .mockResolvedValue({ upserted: 1 }),
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
    syncWebhookRoutes(instance, {
      syncService: mockSyncService as unknown as Parameters<typeof syncWebhookRoutes>[1]['syncService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/sync/webhook', () => {
  let app: FastifyInstance;
  let mockSyncService: MockSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncService = createMockSyncService();
    app = await buildApp(mockSyncService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── Resource routing ──────────────────────────────────────────

  describe('resource routing', () => {
    it('routes order resource to upsertOrders', async () => {
      const data = { wc_order_id: 1, status: 'completed', total: 50, date_created: '2026-01-01' };

      await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'order', action: 'created', data },
      });

      expect(mockSyncService.upsertOrders).toHaveBeenCalledWith(
        STORE_ID,
        [data],
        'webhook:orders',
      );
    });

    it('routes product resource to upsertProducts', async () => {
      const data = { wc_product_id: 10, name: 'Widget' };

      await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'product', action: 'created', data },
      });

      expect(mockSyncService.upsertProducts).toHaveBeenCalledWith(
        STORE_ID,
        [data],
        'webhook:products',
      );
    });

    it('routes customer resource to upsertCustomers', async () => {
      const data = { wc_customer_id: 20, email: 'john@example.com' };

      await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'customer', action: 'updated', data },
      });

      expect(mockSyncService.upsertCustomers).toHaveBeenCalledWith(
        STORE_ID,
        [data],
        'webhook:customers',
      );
    });

    it('routes category resource to upsertCategories', async () => {
      const data = { wc_category_id: 5, name: 'Electronics' };

      await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'category', action: 'created', data },
      });

      expect(mockSyncService.upsertCategories).toHaveBeenCalledWith(
        STORE_ID,
        [data],
        'webhook:categories',
      );
    });
  });

  // ── Successful webhook ────────────────────────────────────────

  describe('successful webhook', () => {
    it('returns 200 with success response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'order',
          action: 'created',
          data: { wc_order_id: 1 },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('wraps data in array for single entity', async () => {
      const data = { wc_order_id: 999 };

      await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'order', action: 'created', data },
      });

      const callArgs = (mockSyncService.upsertOrders.mock.calls as unknown[][])[0];
      expect(callArgs[1]).toEqual([data]); // data should be wrapped in array
    });

    it('handles updated action', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {
          resource: 'product',
          action: 'updated',
          data: { wc_product_id: 5, name: 'Updated' },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(mockSyncService.upsertProducts).toHaveBeenCalled();
    });
  });

  // ── Validation ────────────────────────────────────────────────

  describe('validation', () => {
    it('returns 400 when resource is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { action: 'created', data: {} },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when action is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'order', data: {} },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when data is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'order', action: 'created' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid resource type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'invalid', action: 'created', data: {} },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid action type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'order', action: 'deleted', data: {} },
      });

      expect(response.statusCode).toBe(400);
    });

    it('does not call any upsert method when validation fails', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: {},
      });

      expect(mockSyncService.upsertOrders).not.toHaveBeenCalled();
      expect(mockSyncService.upsertProducts).not.toHaveBeenCalled();
      expect(mockSyncService.upsertCustomers).not.toHaveBeenCalled();
      expect(mockSyncService.upsertCategories).not.toHaveBeenCalled();
    });
  });

  // ── Error handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 when upsert throws', async () => {
      mockSyncService.upsertOrders.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/webhook',
        payload: { resource: 'order', action: 'created', data: { wc_order_id: 1 } },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ── Route configuration ───────────────────────────────────────

  describe('route configuration', () => {
    it('returns 404 for GET method', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/webhook' });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/sync/webhook' });
      expect(response.statusCode).toBe(404);
    });
  });
});
