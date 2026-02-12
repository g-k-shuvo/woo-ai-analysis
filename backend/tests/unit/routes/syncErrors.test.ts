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

const { syncErrorsRoutes } = await import('../../../src/routes/sync/errors.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const INVALID_UUID = 'not-a-uuid';

interface MockSyncRetryService {
  getFailedSyncs: jest.Mock<(storeId: string) => Promise<unknown[]>>;
  scheduleRetry: jest.Mock<(storeId: string, syncLogId: string) => Promise<Record<string, unknown>>>;
}

async function buildApp(mockSyncRetryService: MockSyncRetryService): Promise<FastifyInstance> {
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
    syncErrorsRoutes(instance, {
      syncRetryService: mockSyncRetryService as unknown as Parameters<typeof syncErrorsRoutes>[1]['syncRetryService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('GET /api/sync/errors', () => {
  let app: FastifyInstance;
  let mockRetryService: MockSyncRetryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRetryService = {
      getFailedSyncs: jest.fn<(storeId: string) => Promise<unknown[]>>().mockResolvedValue([]),
      scheduleRetry: jest.fn<(storeId: string, syncLogId: string) => Promise<Record<string, unknown>>>()
        .mockResolvedValue({ scheduled: true }),
    };
    app = await buildApp(mockRetryService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('successful response', () => {
    it('returns 200 with success true', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/errors' });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('returns empty failedSyncs array', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/sync/errors' });

      const body = JSON.parse(response.body);
      expect(body.data.failedSyncs).toEqual([]);
    });

    it('returns failedSyncs from syncRetryService', async () => {
      const failedSyncs = [
        { id: VALID_UUID, syncType: 'orders', error: 'Timeout', retryCount: 2 },
      ];
      mockRetryService.getFailedSyncs.mockResolvedValue(failedSyncs);

      const response = await app.inject({ method: 'GET', url: '/api/sync/errors' });

      const body = JSON.parse(response.body);
      expect(body.data.failedSyncs).toEqual(failedSyncs);
    });

    it('passes store.id to getFailedSyncs', async () => {
      await app.inject({ method: 'GET', url: '/api/sync/errors' });

      expect(mockRetryService.getFailedSyncs).toHaveBeenCalledWith(STORE_ID);
    });
  });

  describe('error handling', () => {
    it('returns 500 when getFailedSyncs throws', async () => {
      mockRetryService.getFailedSyncs.mockRejectedValue(new Error('DB error'));

      const response = await app.inject({ method: 'GET', url: '/api/sync/errors' });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('route configuration', () => {
    it('returns 404 for POST on /api/sync/errors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/errors',
        payload: {},
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE on /api/sync/errors', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/sync/errors' });
      expect(response.statusCode).toBe(404);
    });
  });
});

// ── POST /api/sync/retry/:syncLogId ─────────────────────────────────

describe('POST /api/sync/retry/:syncLogId', () => {
  let app: FastifyInstance;
  let mockRetryService: MockSyncRetryService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRetryService = {
      getFailedSyncs: jest.fn<(storeId: string) => Promise<unknown[]>>().mockResolvedValue([]),
      scheduleRetry: jest.fn<(storeId: string, syncLogId: string) => Promise<Record<string, unknown>>>()
        .mockResolvedValue({ scheduled: true, syncLogId: VALID_UUID }),
    };
    app = await buildApp(mockRetryService);
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('successful retry', () => {
    it('returns 200 with success response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('returns data from scheduleRetry', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID}`,
      });

      const body = JSON.parse(response.body);
      expect(body.data.scheduled).toBe(true);
    });

    it('passes store.id and syncLogId to scheduleRetry', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID}`,
      });

      expect(mockRetryService.scheduleRetry).toHaveBeenCalledWith(STORE_ID, VALID_UUID);
    });
  });

  describe('UUID validation', () => {
    it('returns 400 for invalid UUID format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${INVALID_UUID}`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for too-short UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/retry/a1b2c3d4',
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for uppercase UUID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/retry/A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
      });

      expect(response.statusCode).toBe(400);
    });

    it('does not call scheduleRetry when UUID is invalid', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${INVALID_UUID}`,
      });

      expect(mockRetryService.scheduleRetry).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns 500 when scheduleRetry throws', async () => {
      mockRetryService.scheduleRetry.mockRejectedValue(new Error('Not found'));

      const response = await app.inject({
        method: 'POST',
        url: `/api/sync/retry/${VALID_UUID}`,
      });

      expect(response.statusCode).toBe(500);
    });
  });

  describe('route configuration', () => {
    it('returns 404 for GET method on retry route', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/sync/retry/${VALID_UUID}`,
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method on retry route', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/sync/retry/${VALID_UUID}`,
      });
      expect(response.statusCode).toBe(404);
    });
  });
});
