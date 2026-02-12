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

const { syncCustomersRoutes } = await import('../../../src/routes/sync/customers.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

interface MockSyncService {
  upsertCustomers: jest.Mock<(storeId: string, customers: unknown[]) => Promise<{ upserted: number }>>;
}

function makeCustomer(overrides: Record<string, unknown> = {}) {
  return {
    wc_customer_id: 301,
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
    syncCustomersRoutes(instance, {
      syncService: mockSyncService as unknown as Parameters<typeof syncCustomersRoutes>[1]['syncService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/sync/customers', () => {
  let app: FastifyInstance;
  let mockSyncService: MockSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncService = {
      upsertCustomers: jest.fn<(storeId: string, customers: unknown[]) => Promise<{ upserted: number }>>()
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
        url: '/api/sync/customers',
        payload: { customers: [makeCustomer()] },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('returns data from syncService.upsertCustomers', async () => {
      mockSyncService.upsertCustomers.mockResolvedValue({ upserted: 25 });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: [makeCustomer()] },
      });

      const body = JSON.parse(response.body);
      expect(body.data.upserted).toBe(25);
    });

    it('passes storeId and customers to upsertCustomers', async () => {
      const customer = makeCustomer({ wc_customer_id: 555 });

      await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: [customer] },
      });

      expect(mockSyncService.upsertCustomers).toHaveBeenCalledWith(STORE_ID, [customer]);
    });

    it('accepts empty customers array and calls upsertCustomers with it', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: [] },
      });

      expect(response.statusCode).toBe(200);
      expect(mockSyncService.upsertCustomers).toHaveBeenCalledWith(STORE_ID, []);
    });
  });

  describe('validation', () => {
    it('returns 400 when customers field is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when customers is not an array', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: 'not-array' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when customer is missing required wc_customer_id', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: [{ email: 'test@example.com' }] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('does not call upsertCustomers when validation fails', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: {},
      });

      expect(mockSyncService.upsertCustomers).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 when upsertCustomers throws', async () => {
      mockSyncService.upsertCustomers.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: [makeCustomer()] },
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('route configuration', () => {
    it('returns 404 for GET method', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/customers' });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/sync/customers' });
      expect(response.statusCode).toBe(404);
    });
  });
});
