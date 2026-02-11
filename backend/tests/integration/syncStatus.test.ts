import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { syncStatusRoutes } from '../../src/routes/sync/status.js';
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
    getSyncStatus: jest.fn<(storeId: string) => Promise<{
      lastSyncAt: string | null;
      recordCounts: { orders: number; products: number; customers: number; categories: number };
      recentSyncs: Array<{
        id: string;
        syncType: string;
        recordsSynced: number;
        status: string;
        startedAt: string;
        completedAt: string | null;
        errorMessage: string | null;
      }>;
    }>>().mockResolvedValue({
      lastSyncAt: '2026-02-11T10:30:00Z',
      recordCounts: {
        orders: 1250,
        products: 85,
        customers: 420,
        categories: 12,
      },
      recentSyncs: [
        {
          id: 'log-uuid-1',
          syncType: 'orders',
          recordsSynced: 50,
          status: 'completed',
          startedAt: '2026-02-11T10:30:00Z',
          completedAt: '2026-02-11T10:30:05Z',
          errorMessage: null,
        },
      ],
    }),
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

  await app.register(async (instance) => syncStatusRoutes(instance, { syncService: mockService as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
  await app.ready();
  return app;
}

describe('Sync Status Routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  describe('GET /api/sync/status', () => {
    it('returns 200 with complete sync status data', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/status',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.lastSyncAt).toBe('2026-02-11T10:30:00Z');
      expect(body.data.recordCounts).toEqual({
        orders: 1250,
        products: 85,
        customers: 420,
        categories: 12,
      });
      expect(body.data.recentSyncs).toHaveLength(1);
      expect(body.data.recentSyncs[0].syncType).toBe('orders');
      expect(body.data.recentSyncs[0].status).toBe('completed');
    });

    it('returns 200 with zero counts for a new store', async () => {
      const mockService = createMockSyncService();
      mockService.getSyncStatus.mockResolvedValueOnce({
        lastSyncAt: null,
        recordCounts: {
          orders: 0,
          products: 0,
          customers: 0,
          categories: 0,
        },
        recentSyncs: [],
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/status',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.lastSyncAt).toBeNull();
      expect(body.data.recordCounts.orders).toBe(0);
      expect(body.data.recordCounts.products).toBe(0);
      expect(body.data.recordCounts.customers).toBe(0);
      expect(body.data.recordCounts.categories).toBe(0);
      expect(body.data.recentSyncs).toEqual([]);
    });

    it('passes store.id from auth context to service', async () => {
      const mockService = createMockSyncService();
      app = await buildApp(mockService);

      await app.inject({
        method: 'GET',
        url: '/api/sync/status',
      });

      expect(mockService.getSyncStatus).toHaveBeenCalledWith('store-123');
    });

    it('returns 500 when service throws an error', async () => {
      const mockService = createMockSyncService();
      mockService.getSyncStatus.mockRejectedValueOnce(new Error('Database connection failed'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/status',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });

    it('includes running sync entries in response', async () => {
      const mockService = createMockSyncService();
      mockService.getSyncStatus.mockResolvedValueOnce({
        lastSyncAt: '2026-02-11T10:30:00Z',
        recordCounts: {
          orders: 500,
          products: 40,
          customers: 200,
          categories: 8,
        },
        recentSyncs: [
          {
            id: 'log-running',
            syncType: 'orders',
            recordsSynced: 0,
            status: 'running',
            startedAt: '2026-02-11T11:00:00Z',
            completedAt: null,
            errorMessage: null,
          },
          {
            id: 'log-completed',
            syncType: 'products',
            recordsSynced: 40,
            status: 'completed',
            startedAt: '2026-02-11T10:30:00Z',
            completedAt: '2026-02-11T10:30:03Z',
            errorMessage: null,
          },
        ],
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/status',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.recentSyncs).toHaveLength(2);
      expect(body.data.recentSyncs[0].status).toBe('running');
      expect(body.data.recentSyncs[0].completedAt).toBeNull();
      expect(body.data.recentSyncs[1].status).toBe('completed');
    });

    it('includes failed sync entries with error message', async () => {
      const mockService = createMockSyncService();
      mockService.getSyncStatus.mockResolvedValueOnce({
        lastSyncAt: '2026-02-11T10:30:00Z',
        recordCounts: {
          orders: 100,
          products: 10,
          customers: 50,
          categories: 5,
        },
        recentSyncs: [
          {
            id: 'log-failed',
            syncType: 'webhook:orders',
            recordsSynced: 0,
            status: 'failed',
            startedAt: '2026-02-11T11:00:00Z',
            completedAt: '2026-02-11T11:00:01Z',
            errorMessage: 'Duplicate key violation',
          },
        ],
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/status',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.recentSyncs[0].status).toBe('failed');
      expect(body.data.recentSyncs[0].errorMessage).toBe('Duplicate key violation');
    });
  });
});
