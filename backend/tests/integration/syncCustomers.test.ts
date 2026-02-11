import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { syncCustomersRoutes } from '../../src/routes/sync/customers.js';
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
    upsertCustomers: jest.fn<(storeId: string, customers: unknown[]) => Promise<{ syncedCount: number; skippedCount: number; syncLogId: string }>>().mockResolvedValue({
      syncedCount: 1,
      skippedCount: 0,
      syncLogId: 'sync-log-uuid',
    }),
  };
}

function makeValidCustomer(overrides: Record<string, unknown> = {}) {
  return {
    wc_customer_id: 42,
    email: 'john@example.com',
    display_name: 'John D.',
    total_spent: 499.95,
    order_count: 5,
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

  await app.register(async (instance) => syncCustomersRoutes(instance, { syncService: mockService as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
  await app.ready();
  return app;
}

describe('Sync Customers Routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  describe('POST /api/sync/customers', () => {
    it('returns 200 with sync result on successful batch', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: [makeValidCustomer()] },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(1);
      expect(body.data.skippedCount).toBe(0);
      expect(body.data.syncLogId).toBe('sync-log-uuid');
      expect(mockService.upsertCustomers).toHaveBeenCalledWith('store-123', [makeValidCustomer()]);
    });

    it('returns 200 with empty customers array', async () => {
      const mockService = createMockSyncService();
      mockService.upsertCustomers.mockResolvedValueOnce({
        syncedCount: 0,
        skippedCount: 0,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: [] },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncedCount).toBe(0);
    });

    it('returns 400 when customers field is missing', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: {},
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when customers is not an array', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: 'not-an-array' },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when a customer is missing required fields', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: {
          customers: [
            makeValidCustomer(),
            { email: 'missing-id@test.com' }, // invalid, missing wc_customer_id
          ],
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 200 with partial success when service reports skipped customers', async () => {
      const mockService = createMockSyncService();
      mockService.upsertCustomers.mockResolvedValueOnce({
        syncedCount: 1,
        skippedCount: 1,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: {
          customers: [
            makeValidCustomer(),
            makeValidCustomer({ wc_customer_id: 43 }),
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
      mockService.upsertCustomers.mockRejectedValueOnce(new SyncError('Failed to upsert customers'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: [makeValidCustomer()] },
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
        url: '/api/sync/customers',
        payload: { customers: [makeValidCustomer()] },
      });

      expect(mockService.upsertCustomers).toHaveBeenCalledWith(
        'store-123',
        expect.any(Array),
      );
    });

    it('returns 400 when body has wrong type for customers field', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers: 123 },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('handles large batch payload', async () => {
      const mockService = createMockSyncService();
      mockService.upsertCustomers.mockResolvedValueOnce({
        syncedCount: 100,
        skippedCount: 0,
        syncLogId: 'sync-log-uuid',
      });
      app = await buildApp(mockService);

      const customers = Array.from({ length: 100 }, (_, i) =>
        makeValidCustomer({ wc_customer_id: i + 1 }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/customers',
        payload: { customers },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.syncedCount).toBe(100);
    });
  });
});
