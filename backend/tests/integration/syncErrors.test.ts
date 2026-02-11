import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { FailedSyncEntry, RetryScheduleResult, SyncRetryService } from '../../src/services/syncRetryService.js';

// ESM-compatible mocks — must be set up BEFORE dynamic import
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { syncErrorsRoutes } = await import('../../src/routes/sync/errors.js');
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');
const { NotFoundError, ValidationError } = await import('../../src/utils/errors.js');

const VALID_UUID_1 = '00000000-0000-0000-0000-000000000001';
const VALID_UUID_2 = '00000000-0000-0000-0000-000000000002';
const VALID_UUID_NOT_FOUND = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

type MockSyncRetryService = {
  [K in keyof SyncRetryService]: jest.Mock<SyncRetryService[K]>;
};

function createMockSyncRetryService(): MockSyncRetryService {
  return {
    getFailedSyncs: jest.fn<(storeId: string) => Promise<FailedSyncEntry[]>>().mockResolvedValue([
      {
        id: VALID_UUID_1,
        syncType: 'orders',
        errorMessage: 'DB connection failed',
        retryCount: 2,
        nextRetryAt: '2026-02-11T12:05:00Z',
        startedAt: '2026-02-11T12:00:00Z',
      },
      {
        id: VALID_UUID_2,
        syncType: 'webhook:products',
        errorMessage: 'Timeout exceeded',
        retryCount: 0,
        nextRetryAt: null,
        startedAt: '2026-02-11T11:50:00Z',
      },
    ]),
    scheduleRetry: jest.fn<(storeId: string, syncLogId: string) => Promise<RetryScheduleResult>>().mockResolvedValue({
      syncLogId: VALID_UUID_1,
      status: 'retry_scheduled',
      nextRetryAt: '2026-02-11T12:05:30Z',
    }),
    markRetryStarted: jest.fn<(storeId: string, syncLogId: string) => Promise<void>>().mockResolvedValue(undefined),
    getDueRetries: jest.fn<(storeId: string) => Promise<FailedSyncEntry[]>>().mockResolvedValue([]),
    detectStaleSyncs: jest.fn<(storeId: string) => Promise<number>>().mockResolvedValue(0),
  };
}

async function buildApp(mockService: MockSyncRetryService) {
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

  await app.register(async (instance) => syncErrorsRoutes(instance, { syncRetryService: mockService }));
  await app.ready();
  return app;
}

describe('Sync Errors Routes', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
    jest.clearAllMocks();
  });

  describe('GET /api/sync/errors', () => {
    it('returns 200 with failed syncs for authenticated store', async () => {
      const mockService = createMockSyncRetryService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/errors',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.failedSyncs).toHaveLength(2);
      expect(body.data.failedSyncs[0].id).toBe(VALID_UUID_1);
      expect(body.data.failedSyncs[0].syncType).toBe('orders');
      expect(body.data.failedSyncs[0].errorMessage).toBe('DB connection failed');
      expect(body.data.failedSyncs[0].retryCount).toBe(2);
      expect(body.data.failedSyncs[0].nextRetryAt).toBe('2026-02-11T12:05:00Z');
    });

    it('passes store.id from auth context to service', async () => {
      const mockService = createMockSyncRetryService();
      app = await buildApp(mockService);

      await app.inject({
        method: 'GET',
        url: '/api/sync/errors',
      });

      expect(mockService.getFailedSyncs).toHaveBeenCalledWith('store-123');
    });

    it('returns 200 with empty array when no failed syncs exist', async () => {
      const mockService = createMockSyncRetryService();
      mockService.getFailedSyncs.mockResolvedValueOnce([]);
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/errors',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.failedSyncs).toEqual([]);
    });

    it('returns 500 when service throws an unexpected error', async () => {
      const mockService = createMockSyncRetryService();
      mockService.getFailedSyncs.mockRejectedValueOnce(new Error('Database unreachable'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/errors',
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /api/sync/retry/:syncLogId', () => {
    it('returns 200 with retry_scheduled when retry is successful', async () => {
      const mockService = createMockSyncRetryService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID_1}`,
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.syncLogId).toBe(VALID_UUID_1);
      expect(body.data.status).toBe('retry_scheduled');
      expect(body.data.nextRetryAt).toBe('2026-02-11T12:05:30Z');
    });

    it('passes store.id and syncLogId to service', async () => {
      const mockService = createMockSyncRetryService();
      app = await buildApp(mockService);

      await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID_1}`,
      });

      expect(mockService.scheduleRetry).toHaveBeenCalledWith('store-123', VALID_UUID_1);
    });

    it('returns 200 with max_retries_reached when sync has exhausted retries', async () => {
      const mockService = createMockSyncRetryService();
      mockService.scheduleRetry.mockResolvedValueOnce({
        syncLogId: VALID_UUID_1,
        status: 'max_retries_reached',
        nextRetryAt: null,
      });
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID_1}`,
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.data.status).toBe('max_retries_reached');
      expect(body.data.nextRetryAt).toBeNull();
    });

    it('returns 404 when sync log not found', async () => {
      const mockService = createMockSyncRetryService();
      mockService.scheduleRetry.mockRejectedValueOnce(new NotFoundError('Sync log not found'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID_NOT_FOUND}`,
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 when sync log is not in failed state', async () => {
      const mockService = createMockSyncRetryService();
      mockService.scheduleRetry.mockRejectedValueOnce(new ValidationError('Sync log is not in failed state'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID_1}`,
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(400);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when syncLogId is not a valid UUID', async () => {
      const mockService = createMockSyncRetryService();
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/retry/not-a-uuid',
      });

      expect(response.statusCode).toBe(400);
      expect(mockService.scheduleRetry).not.toHaveBeenCalled();
    });

    it('returns 500 when service throws unexpected error', async () => {
      const mockService = createMockSyncRetryService();
      mockService.scheduleRetry.mockRejectedValueOnce(new Error('Database offline'));
      app = await buildApp(mockService);

      const response = await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID_1}`,
      });
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });
});
