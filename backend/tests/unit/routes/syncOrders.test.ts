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

const { syncOrdersRoutes } = await import('../../../src/routes/sync/orders.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

interface MockSyncService {
  upsertOrders: jest.Mock<(storeId: string, orders: unknown[]) => Promise<{ upserted: number }>>;
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    wc_order_id: 1001,
    date_created: '2026-01-15T10:00:00Z',
    status: 'completed',
    total: 59.99,
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
    syncOrdersRoutes(instance, {
      syncService: mockSyncService as unknown as Parameters<typeof syncOrdersRoutes>[1]['syncService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/sync/orders', () => {
  let app: FastifyInstance;
  let mockSyncService: MockSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncService = {
      upsertOrders: jest.fn<(storeId: string, orders: unknown[]) => Promise<{ upserted: number }>>()
        .mockResolvedValue({ upserted: 1 }),
    };
    app = await buildApp(mockSyncService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── Successful sync ──────────────────────────────────────────

  describe('successful sync', () => {
    it('returns 200 with success response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [makeOrder()] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('returns data from syncService.upsertOrders', async () => {
      mockSyncService.upsertOrders.mockResolvedValue({ upserted: 5 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [makeOrder()] },
      });

      const body = JSON.parse(response.body);
      expect(body.data.upserted).toBe(5);
    });

    it('passes storeId and orders to upsertOrders', async () => {
      const order = makeOrder({ wc_order_id: 2002 });

      await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [order] },
      });

      expect(mockSyncService.upsertOrders).toHaveBeenCalledWith(STORE_ID, [order]);
    });

    it('accepts multiple orders', async () => {
      const orders = [makeOrder({ wc_order_id: 1 }), makeOrder({ wc_order_id: 2 })];

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders },
      });

      expect(response.statusCode).toBe(200);
      expect(mockSyncService.upsertOrders).toHaveBeenCalledWith(STORE_ID, orders);
    });

    it('accepts empty orders array and calls upsertOrders with it', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [] },
      });

      expect(response.statusCode).toBe(200);
      expect(mockSyncService.upsertOrders).toHaveBeenCalledWith(STORE_ID, []);
    });
  });

  // ── Validation ────────────────────────────────────────────────

  describe('validation', () => {
    it('returns 400 when orders field is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when orders is not an array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: 'not-array' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when order item is missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [{ wc_order_id: 1 }] }, // missing date_created, status, total
      });

      expect(response.statusCode).toBe(400);
    });

    it('does not call upsertOrders when validation fails', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: {},
      });

      expect(mockSyncService.upsertOrders).not.toHaveBeenCalled();
    });
  });

  // ── Error handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 when upsertOrders throws', async () => {
      mockSyncService.upsertOrders.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [makeOrder()] },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  // ── Route configuration ───────────────────────────────────────

  describe('route configuration', () => {
    it('responds to POST method', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/orders',
        payload: { orders: [makeOrder()] },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 404 for GET method', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/orders' });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/sync/orders' });
      expect(response.statusCode).toBe(404);
    });
  });
});
