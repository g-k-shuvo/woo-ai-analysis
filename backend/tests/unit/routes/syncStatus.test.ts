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

const { syncStatusRoutes } = await import('../../../src/routes/sync/status.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

interface MockSyncService {
  getSyncStatus: jest.Mock<(storeId: string) => Promise<Record<string, unknown>>>;
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
    syncStatusRoutes(instance, {
      syncService: mockSyncService as unknown as Parameters<typeof syncStatusRoutes>[1]['syncService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('GET /api/sync/status', () => {
  let app: FastifyInstance;
  let mockSyncService: MockSyncService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSyncService = {
      getSyncStatus: jest.fn<(storeId: string) => Promise<Record<string, unknown>>>().mockResolvedValue({
        lastSync: '2026-01-15T12:00:00Z',
        totalOrders: 500,
        totalProducts: 100,
        totalCustomers: 200,
        status: 'healthy',
      }),
    };
    app = await buildApp(mockSyncService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('successful response', () => {
    it('returns 200 with success true', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/status' });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('returns data from syncService.getSyncStatus', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/status' });

      const body = JSON.parse(response.body);
      expect(body.data.lastSync).toBe('2026-01-15T12:00:00Z');
      expect(body.data.totalOrders).toBe(500);
      expect(body.data.status).toBe('healthy');
    });

    it('passes store.id to getSyncStatus', async () => {
      await app.inject({ method: 'GET', url: '/api/sync/status' });

      expect(mockSyncService.getSyncStatus).toHaveBeenCalledWith(STORE_ID);
    });
  });

  describe('error handling', () => {
    it('returns 500 when getSyncStatus throws', async () => {
      mockSyncService.getSyncStatus.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({ method: 'GET', url: '/api/sync/status' });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('route configuration', () => {
    it('responds to GET method', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/status' });
      expect(response.statusCode).toBe(200);
    });

    it('returns 404 for POST method', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/status',
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/sync/status' });
      expect(response.statusCode).toBe(404);
    });
  });
});
