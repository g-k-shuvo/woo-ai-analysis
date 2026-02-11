import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NotFoundError } from '../../src/utils/errors.js';

// ESM-compatible mocks — must be set up BEFORE dynamic import
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createSyncRetryService, calculateBackoff, MAX_RETRIES, BASE_BACKOFF_SECONDS, MAX_BACKOFF_SECONDS } =
  await import('../../src/services/syncRetryService.js');

interface MockQueryBuilder {
  where: jest.Mock;
  select: jest.Mock;
  insert: jest.Mock;
  update: jest.Mock<() => Promise<number>>;
  orderBy: jest.Mock;
  limit: jest.Mock<() => Promise<unknown[]>>;
  first: jest.Mock<() => Promise<unknown>>;
}

function createMockDb() {
  const mockQueryBuilder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    first: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
  };

  const db = jest.fn().mockReturnValue(mockQueryBuilder) as jest.Mock & {
    fn: { now: jest.Mock };
    raw: jest.Mock<(expr: string) => string>;
  };
  Object.assign(db, {
    fn: { now: jest.fn().mockReturnValue('NOW()') },
    raw: jest.fn<(expr: string) => string>().mockImplementation((expr: string) => expr),
  });

  return { db: db as any, mockQueryBuilder }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('calculateBackoff', () => {
  it('returns base backoff for retry 0', () => {
    expect(calculateBackoff(0)).toBe(BASE_BACKOFF_SECONDS); // 30
  });

  it('doubles backoff for each retry', () => {
    expect(calculateBackoff(1)).toBe(60);  // 2^1 * 30
    expect(calculateBackoff(2)).toBe(120); // 2^2 * 30
    expect(calculateBackoff(3)).toBe(240); // 2^3 * 30
    expect(calculateBackoff(4)).toBe(480); // 2^4 * 30
  });

  it('caps backoff at MAX_BACKOFF_SECONDS', () => {
    expect(calculateBackoff(10)).toBe(MAX_BACKOFF_SECONDS); // 2^10 * 30 = 30720, capped at 900
  });
});

describe('SyncRetryService', () => {
  let db: ReturnType<typeof createMockDb>['db'];
  let mockQueryBuilder: ReturnType<typeof createMockDb>['mockQueryBuilder'];

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMockDb();
    db = mocks.db;
    mockQueryBuilder = mocks.mockQueryBuilder;
  });

  describe('getFailedSyncs', () => {
    it('queries sync_logs filtered by store_id and failed status', async () => {
      mockQueryBuilder.limit.mockResolvedValueOnce([
        {
          id: 'log-1',
          sync_type: 'orders',
          error_message: 'Connection lost',
          retry_count: 1,
          next_retry_at: '2026-02-11T12:05:00Z',
          started_at: '2026-02-11T12:00:00Z',
        },
      ]);

      const service = createSyncRetryService({ db });
      const result = await service.getFailedSyncs('store-123');

      expect(db).toHaveBeenCalledWith('sync_logs');
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'id', 'sync_type', 'error_message', 'retry_count', 'next_retry_at', 'started_at',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ store_id: 'store-123', status: 'failed' });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('retry_count', '<', MAX_RETRIES);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'log-1',
        syncType: 'orders',
        errorMessage: 'Connection lost',
        retryCount: 1,
        nextRetryAt: '2026-02-11T12:05:00Z',
        startedAt: '2026-02-11T12:00:00Z',
      });
    });

    it('returns empty array when no failed syncs exist', async () => {
      mockQueryBuilder.limit.mockResolvedValueOnce([]);

      const service = createSyncRetryService({ db });
      const result = await service.getFailedSyncs('store-123');

      expect(result).toEqual([]);
    });

    it('maps snake_case DB columns to camelCase', async () => {
      mockQueryBuilder.limit.mockResolvedValueOnce([
        {
          id: 'log-2',
          sync_type: 'webhook:products',
          error_message: null,
          retry_count: 0,
          next_retry_at: null,
          started_at: '2026-02-11T10:00:00Z',
        },
      ]);

      const service = createSyncRetryService({ db });
      const result = await service.getFailedSyncs('store-123');

      expect(result[0].syncType).toBe('webhook:products');
      expect(result[0].errorMessage).toBeNull();
      expect(result[0].retryCount).toBe(0);
      expect(result[0].nextRetryAt).toBeNull();
    });
  });

  describe('scheduleRetry', () => {
    it('throws NotFoundError when sync log does not exist', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(undefined);

      const service = createSyncRetryService({ db });

      await expect(service.scheduleRetry('store-123', 'nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when sync log is not in failed state', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'log-1',
        retry_count: 0,
        status: 'completed',
      });

      const service = createSyncRetryService({ db });

      await expect(service.scheduleRetry('store-123', 'log-1')).rejects.toThrow(NotFoundError);
    });

    it('returns max_retries_reached when retry count >= MAX_RETRIES', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'log-1',
        retry_count: MAX_RETRIES,
        status: 'failed',
      });

      const service = createSyncRetryService({ db });
      const result = await service.scheduleRetry('store-123', 'log-1');

      expect(result.status).toBe('max_retries_reached');
      expect(result.nextRetryAt).toBeNull();
    });

    it('schedules retry with exponential backoff for failed sync with retry_count < MAX_RETRIES', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'log-1',
        retry_count: 2,
        status: 'failed',
      });

      const service = createSyncRetryService({ db });
      const beforeCall = Date.now();
      const result = await service.scheduleRetry('store-123', 'log-1');

      expect(result.status).toBe('retry_scheduled');
      expect(result.syncLogId).toBe('log-1');
      expect(result.nextRetryAt).not.toBeNull();

      // Backoff for retry_count=2 should be 2^2 * 30 = 120 seconds
      const scheduledTime = new Date(result.nextRetryAt!).getTime();
      const expectedMin = beforeCall + 120 * 1000 - 1000; // 1s tolerance
      const expectedMax = beforeCall + 120 * 1000 + 1000;
      expect(scheduledTime).toBeGreaterThanOrEqual(expectedMin);
      expect(scheduledTime).toBeLessThanOrEqual(expectedMax);

      // Verify DB update was called with store_id filter
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'log-1', store_id: 'store-123' });
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          next_retry_at: expect.any(String),
        }),
      );
    });

    it('uses store_id filter when fetching sync log', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'log-1',
        retry_count: 0,
        status: 'failed',
      });

      const service = createSyncRetryService({ db });
      await service.scheduleRetry('store-123', 'log-1');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'log-1', store_id: 'store-123' });
    });
  });

  describe('markRetryStarted', () => {
    it('updates sync log to running state and increments retry_count', async () => {
      const service = createSyncRetryService({ db });
      await service.markRetryStarted('store-123', 'log-1');

      expect(db).toHaveBeenCalledWith('sync_logs');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'log-1', store_id: 'store-123' });
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          next_retry_at: null,
          error_message: null,
          completed_at: null,
        }),
      );
    });
  });

  describe('getDueRetries', () => {
    it('queries for failed syncs where next_retry_at <= now', async () => {
      mockQueryBuilder.limit.mockResolvedValueOnce([
        {
          id: 'log-1',
          sync_type: 'orders',
          error_message: 'Timeout',
          retry_count: 1,
          next_retry_at: '2026-02-11T12:00:00Z',
          started_at: '2026-02-11T11:58:00Z',
        },
      ]);

      const service = createSyncRetryService({ db });
      const result = await service.getDueRetries('store-123');

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ store_id: 'store-123', status: 'failed' });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('retry_count', '<', MAX_RETRIES);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('next_retry_at', '<=', 'NOW()');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('log-1');
    });

    it('returns empty array when no retries are due', async () => {
      mockQueryBuilder.limit.mockResolvedValueOnce([]);

      const service = createSyncRetryService({ db });
      const result = await service.getDueRetries('store-123');

      expect(result).toEqual([]);
    });
  });

  describe('detectStaleSyncs', () => {
    it('marks running syncs older than threshold as failed', async () => {
      mockQueryBuilder.update.mockResolvedValueOnce(3);

      const service = createSyncRetryService({ db });
      const beforeCall = Date.now();
      const count = await service.detectStaleSyncs('store-123');

      expect(count).toBe(3);
      expect(db).toHaveBeenCalledWith('sync_logs');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ store_id: 'store-123', status: 'running' });
      // Check that started_at threshold is roughly 15 min ago
      const thresholdCall = mockQueryBuilder.where.mock.calls.find(
        (call: unknown[]) => call[0] === 'started_at' && call[1] === '<',
      );
      expect(thresholdCall).toBeDefined();
      const thresholdDate = new Date(thresholdCall![2] as string).getTime();
      const expectedThreshold = beforeCall - 15 * 60 * 1000;
      expect(Math.abs(thresholdDate - expectedThreshold)).toBeLessThan(2000); // 2s tolerance
    });

    it('updates status to failed with stale error message', async () => {
      mockQueryBuilder.update.mockResolvedValueOnce(1);

      const service = createSyncRetryService({ db });
      await service.detectStaleSyncs('store-123');

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Sync stalled — exceeded 15 minute threshold',
        }),
      );
    });

    it('returns 0 when no stale syncs found', async () => {
      mockQueryBuilder.update.mockResolvedValueOnce(0);

      const service = createSyncRetryService({ db });
      const count = await service.detectStaleSyncs('store-123');

      expect(count).toBe(0);
    });
  });
});
