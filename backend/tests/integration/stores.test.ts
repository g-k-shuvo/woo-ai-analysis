import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { storeRoutes } from '../../src/routes/stores.js';
import { registerErrorHandler } from '../../src/middleware/errorHandler.js';

// Mock logger
jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function createMockStoreService() {
  return {
    connectStore: jest.fn<() => Promise<{ storeId: string }>>().mockResolvedValue({
      storeId: 'new-store-uuid',
    }),
    getStoreById: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
      id: 'store-123',
      store_url: 'https://myshop.com',
      plan: 'free',
      connected_at: '2026-01-01T00:00:00Z',
      last_sync_at: null,
      is_active: true,
    }),
    getStoreByUrl: jest.fn<() => Promise<Record<string, unknown> | undefined>>(),
    getActiveStores: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    verifyApiKey: jest.fn<() => Promise<Record<string, unknown> | null>>(),
    getStoreStatus: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({
      storeId: 'store-123',
      storeUrl: 'https://myshop.com',
      plan: 'free',
      connectedAt: '2026-01-01T00:00:00Z',
      lastSyncAt: null,
      isActive: true,
    }),
    disconnectStore: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe('Store Routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  describe('POST /api/stores/connect', () => {
    it('returns 201 with storeId on successful connection', async () => {
      const mockService = createMockStoreService();
      app = Fastify();
      registerErrorHandler(app);
      await app.register(async (instance) => storeRoutes(instance, { storeService: mockService as any, db: {} as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stores/connect',
        payload: {
          storeUrl: 'https://myshop.com',
          apiKey: 'a'.repeat(64),
          wcVersion: '9.0',
        },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.storeId).toBe('new-store-uuid');
      expect(mockService.connectStore).toHaveBeenCalledWith({
        storeUrl: 'https://myshop.com',
        apiKey: 'a'.repeat(64),
        wcVersion: '9.0',
      });
    });

    it('returns 400 when storeUrl is missing', async () => {
      const mockService = createMockStoreService();
      const { ValidationError } = await import('../../src/utils/errors.js');
      mockService.connectStore.mockRejectedValueOnce(new ValidationError('storeUrl is required'));

      app = Fastify();
      registerErrorHandler(app);
      await app.register(async (instance) => storeRoutes(instance, { storeService: mockService as any, db: {} as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stores/connect',
        payload: { apiKey: 'a'.repeat(64) },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when apiKey is too short', async () => {
      const mockService = createMockStoreService();
      const { ValidationError } = await import('../../src/utils/errors.js');
      mockService.connectStore.mockRejectedValueOnce(
        new ValidationError('apiKey must be at least 32 characters'),
      );

      app = Fastify();
      registerErrorHandler(app);
      await app.register(async (instance) => storeRoutes(instance, { storeService: mockService as any, db: {} as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stores/connect',
        payload: { storeUrl: 'https://myshop.com', apiKey: 'short' },
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('handles empty body gracefully', async () => {
      const mockService = createMockStoreService();
      const { ValidationError } = await import('../../src/utils/errors.js');
      mockService.connectStore.mockRejectedValueOnce(new ValidationError('storeUrl is required'));

      app = Fastify();
      registerErrorHandler(app);
      await app.register(async (instance) => storeRoutes(instance, { storeService: mockService as any, db: {} as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/stores/connect',
        payload: {},
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/stores/status', () => {
    it('returns 200 with store status when authenticated', async () => {
      const mockService = createMockStoreService();
      app = Fastify();
      registerErrorHandler(app);

      // Simulate auth middleware by decorating request
      app.decorateRequest('store', undefined);
      app.addHook('onRequest', async (request) => {
        request.store = {
          id: 'store-123',
          store_url: 'https://myshop.com',
          plan: 'free',
          is_active: true,
        };
      });

      await app.register(async (instance) => storeRoutes(instance, { storeService: mockService as any, db: {} as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/api/stores/status' });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.storeId).toBe('store-123');
      expect(body.data.storeUrl).toBe('https://myshop.com');
      expect(body.data.plan).toBe('free');
    });

  });

  describe('DELETE /api/stores/disconnect', () => {
    it('returns 200 with success message when authenticated', async () => {
      const mockService = createMockStoreService();
      app = Fastify();
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

      await app.register(async (instance) => storeRoutes(instance, { storeService: mockService as any, db: {} as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
      await app.ready();

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/stores/disconnect',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.message).toBe('Store disconnected and all data deleted.');
      expect(mockService.disconnectStore).toHaveBeenCalledWith('store-123');
    });

    it('returns 404 when store service throws NotFoundError', async () => {
      const mockService = createMockStoreService();
      const { NotFoundError } = await import('../../src/utils/errors.js');
      mockService.disconnectStore.mockRejectedValueOnce(new NotFoundError('Store not found'));

      app = Fastify();
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

      await app.register(async (instance) => storeRoutes(instance, { storeService: mockService as any, db: {} as any })); // eslint-disable-line @typescript-eslint/no-explicit-any
      await app.ready();

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/stores/disconnect',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
