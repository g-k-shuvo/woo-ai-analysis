import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { NotFoundError, ValidationError } from '../../src/utils/errors.js';

// ESM-compatible mocks — must be set up BEFORE dynamic import
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createSyncRetryService, calculateBackoff, MAX_RETRIES, STALE_SYNC_THRESHOLD_MINUTES } =
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
  it('returns a value near base backoff for retry 0', () => {
    const result = calculateBackoff(0);
    // With +/- 20% jitter: 30 * 0.8 = 24, 30 * 1.2 = 36
    expect(result).toBeGreaterThanOrEqual(24);
    expect(result).toBeLessThanOrEqual(36);
  });

  it('doubles base backoff for each retry (within jitter range)', () => {
    // retry 1: base=60, range=[48,72]
    expect(calculateBackoff(1)).toBeGreaterThanOrEqual(48);
    expect(calculateBackoff(1)).toBeLessThanOrEqual(72);
    // retry 2: base=120, range=[96,144]
    expect(calculateBackoff(2)).toBeGreaterThanOrEqual(96);
    expect(calculateBackoff(2)).toBeLessThanOrEqual(144);
    // retry 3: base=240, range=[192,288]
    expect(calculateBackoff(3)).toBeGreaterThanOrEqual(192);
    expect(calculateBackoff(3)).toBeLessThanOrEqual(288);
    // retry 4: base=480, range=[384,576]
    expect(calculateBackoff(4)).toBeGreaterThanOrEqual(384);
    expect(calculateBackoff(4)).toBeLessThanOrEqual(576);
  });

  it('caps backoff at MAX_BACKOFF_SECONDS (within jitter range)', () => {
    const result = calculateBackoff(10);
    // base=900 (capped), range=[720,1080]
    expect(result).toBeGreaterThanOrEqual(720);
    expect(result).toBeLessThanOrEqual(1080);
  });

  it('always returns at least 1', () => {
    expect(calculateBackoff(0)).toBeGreaterThanOrEqual(1);
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
      // Atomic update returns 0 (no matching rows)
      mockQueryBuilder.update.mockResolvedValueOnce(0);
      // Re-read returns undefined (not found)
      mockQueryBuilder.first.mockResolvedValueOnce(undefined);

      const service = createSyncRetryService({ db });

      await expect(service.scheduleRetry('store-123', 'nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when sync log is not in failed state', async () => {
      // Atomic update returns 0 (status doesn't match)
      mockQueryBuilder.update.mockResolvedValueOnce(0);
      // Re-read shows status is not 'failed'
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'log-1',
        retry_count: 0,
        status: 'completed',
      });

      const service = createSyncRetryService({ db });

      await expect(service.scheduleRetry('store-123', 'log-1')).rejects.toThrow(ValidationError);
    });

    it('returns max_retries_reached when retry count >= MAX_RETRIES', async () => {
      // Atomic update returns 0 (retry_count filter)
      mockQueryBuilder.update.mockResolvedValueOnce(0);
      // Re-read shows max retries hit
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

    it('atomically increments retry_count and schedules next_retry_at', async () => {
      // Atomic update succeeds (1 row updated)
      mockQueryBuilder.update.mockResolvedValueOnce(1);
      // Re-read returns updated retry_count
      mockQueryBuilder.first.mockResolvedValueOnce({ retry_count: 3 });
      // Second update for next_retry_at succeeds
      mockQueryBuilder.update.mockResolvedValueOnce(1);

      const service = createSyncRetryService({ db });
      const result = await service.scheduleRetry('store-123', 'log-1');

      expect(result.status).toBe('retry_scheduled');
      expect(result.syncLogId).toBe('log-1');
      expect(result.nextRetryAt).not.toBeNull();

      // Verify atomic update includes retry_count increment
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          retry_count: 'retry_count + 1',
        }),
      );

      // Verify store_id is in the WHERE clause
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'log-1', store_id: 'store-123', status: 'failed' }),
      );

      // Verify next_retry_at is set in second update
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          next_retry_at: expect.any(String),
        }),
      );
    });

    it('uses store_id filter in all database queries', async () => {
      mockQueryBuilder.update.mockResolvedValueOnce(1);
      mockQueryBuilder.first.mockResolvedValueOnce({ retry_count: 1 });
      mockQueryBuilder.update.mockResolvedValueOnce(1);

      const service = createSyncRetryService({ db });
      await service.scheduleRetry('store-123', 'log-1');

      // Every where call should include store_id
      const whereCalls = mockQueryBuilder.where.mock.calls;
      const storeIdCalls = whereCalls.filter(
        (call: unknown[]) => typeof call[0] === 'object' && (call[0] as Record<string, unknown>).store_id === 'store-123',
      );
      expect(storeIdCalls.length).toBeGreaterThanOrEqual(2);
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
          retry_count: 'retry_count + 1',
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

    it('uses STALE_SYNC_THRESHOLD_MINUTES constant in error message', async () => {
      mockQueryBuilder.update.mockResolvedValueOnce(1);

      const service = createSyncRetryService({ db });
      await service.detectStaleSyncs('store-123');

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: `Sync stalled -- exceeded ${STALE_SYNC_THRESHOLD_MINUTES} minute threshold`,
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
