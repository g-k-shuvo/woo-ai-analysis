import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ESM-compatible mocks — must be set up BEFORE dynamic import
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Dynamic import AFTER mocks are set up
const { createSyncService } = await import('../../src/services/syncService.js');

interface MockQueryBuilder {
  where: jest.Mock;
  whereIn: jest.Mock<(column: string, values: unknown[]) => Promise<unknown[]>>;
  select: jest.Mock;
  insert: jest.Mock;
  returning: jest.Mock<() => Promise<unknown[]>>;
  update: jest.Mock<() => Promise<number>>;
  del: jest.Mock<() => Promise<number>>;
  onConflict: jest.Mock;
  merge: jest.Mock;
  count: jest.Mock;
  first: jest.Mock<() => Promise<unknown>>;
  orderBy: jest.Mock;
  limit: jest.Mock<() => Promise<unknown[]>>;
}

function createMockDb() {
  const mockQueryBuilder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn<(column: string, values: unknown[]) => Promise<unknown[]>>().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'sync-log-uuid' }]),
    update: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    del: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    onConflict: jest.fn().mockReturnThis(),
    merge: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    first: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  };

  const trxQueryBuilder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn<(column: string, values: unknown[]) => Promise<unknown[]>>().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'order-uuid-1' }]),
    update: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    del: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    onConflict: jest.fn().mockReturnThis(),
    merge: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    first: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  };

  const trxFn = jest.fn().mockReturnValue(trxQueryBuilder) as jest.Mock & {
    commit: jest.Mock;
    rollback: jest.Mock;
    fn: { now: jest.Mock };
  };
  Object.assign(trxFn, {
    commit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    rollback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    fn: { now: jest.fn().mockReturnValue('NOW()') },
  });

  const db = jest.fn().mockReturnValue(mockQueryBuilder) as jest.Mock & {
    fn: { now: jest.Mock };
    transaction: jest.Mock;
  };
  Object.assign(db, {
    fn: { now: jest.fn().mockReturnValue('NOW()') },
    transaction: jest.fn<() => Promise<unknown>>().mockResolvedValue(trxFn),
  });

  return { db: db as any, mockQueryBuilder, trxQueryBuilder, trxFn }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('SyncService.getSyncStatus', () => {
  let db: ReturnType<typeof createMockDb>['db'];
  let mockQueryBuilder: ReturnType<typeof createMockDb>['mockQueryBuilder'];

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMockDb();
    db = mocks.db;
    mockQueryBuilder = mocks.mockQueryBuilder;
  });

  it('returns record counts, lastSyncAt, and recentSyncs for a store', async () => {
    const storeId = 'store-123';

    // Mock: first call is stores table (select → where → first)
    // The db() function returns mockQueryBuilder for any table call.
    // We need to track calls by table name. Since db is a jest.fn() that always
    // returns the same mockQueryBuilder, we use call order + first/count/limit to differentiate.

    // For getSyncStatus, the call order is:
    // 1. db('stores').select('last_sync_at').where({id}).first() → store
    // 2. db('orders').where({store_id}).count().first() → {count}
    // 3. db('products').where({store_id}).count().first() → {count}
    // 4. db('customers').where({store_id}).count().first() → {count}
    // 5. db('categories').where({store_id}).count().first() → {count}
    // 6. db('sync_logs').select(...).where({store_id}).orderBy().limit() → []

    // Since all calls return the same mockQueryBuilder, we control via first() and limit()
    mockQueryBuilder.first
      .mockResolvedValueOnce({ last_sync_at: '2026-02-11T10:30:00Z' }) // stores
      .mockResolvedValueOnce({ count: '1250' })  // orders count
      .mockResolvedValueOnce({ count: '85' })     // products count
      .mockResolvedValueOnce({ count: '420' })    // customers count
      .mockResolvedValueOnce({ count: '12' });    // categories count

    mockQueryBuilder.limit.mockResolvedValueOnce([
      {
        id: 'log-1',
        sync_type: 'orders',
        records_synced: 50,
        status: 'completed',
        started_at: '2026-02-11T10:30:00Z',
        completed_at: '2026-02-11T10:30:05Z',
        error_message: null,
      },
    ]);

    const syncService = createSyncService({ db });
    const result = await syncService.getSyncStatus(storeId);

    expect(result.lastSyncAt).toBe('2026-02-11T10:30:00Z');
    expect(result.recordCounts).toEqual({
      orders: 1250,
      products: 85,
      customers: 420,
      categories: 12,
    });
    expect(result.recentSyncs).toHaveLength(1);
    expect(result.recentSyncs[0]).toEqual({
      id: 'log-1',
      syncType: 'orders',
      recordsSynced: 50,
      status: 'completed',
      startedAt: '2026-02-11T10:30:00Z',
      completedAt: '2026-02-11T10:30:05Z',
      errorMessage: null,
    });
  });

  it('returns null lastSyncAt when store has never synced', async () => {
    const storeId = 'store-new';

    mockQueryBuilder.first
      .mockResolvedValueOnce({ last_sync_at: null }) // stores — never synced
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' });

    mockQueryBuilder.limit.mockResolvedValueOnce([]);

    const syncService = createSyncService({ db });
    const result = await syncService.getSyncStatus(storeId);

    expect(result.lastSyncAt).toBeNull();
    expect(result.recordCounts).toEqual({
      orders: 0,
      products: 0,
      customers: 0,
      categories: 0,
    });
    expect(result.recentSyncs).toEqual([]);
  });

  it('returns zero counts when store has no data', async () => {
    const storeId = 'store-empty';

    mockQueryBuilder.first
      .mockResolvedValueOnce({ last_sync_at: '2026-02-11T10:30:00Z' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' });

    mockQueryBuilder.limit.mockResolvedValueOnce([]);

    const syncService = createSyncService({ db });
    const result = await syncService.getSyncStatus(storeId);

    expect(result.recordCounts).toEqual({
      orders: 0,
      products: 0,
      customers: 0,
      categories: 0,
    });
  });

  it('returns empty recentSyncs when no sync logs exist', async () => {
    const storeId = 'store-no-logs';

    mockQueryBuilder.first
      .mockResolvedValueOnce({ last_sync_at: null })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' });

    mockQueryBuilder.limit.mockResolvedValueOnce([]);

    const syncService = createSyncService({ db });
    const result = await syncService.getSyncStatus(storeId);

    expect(result.recentSyncs).toEqual([]);
  });

  it('filters all queries by store_id', async () => {
    const storeId = 'store-tenant';

    mockQueryBuilder.first
      .mockResolvedValueOnce({ last_sync_at: null })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' });

    mockQueryBuilder.limit.mockResolvedValueOnce([]);

    const syncService = createSyncService({ db });
    await syncService.getSyncStatus(storeId);

    // Verify db was called with correct table names
    const tableNames = db.mock.calls.map((call: unknown[]) => call[0]);
    expect(tableNames).toContain('stores');
    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('products');
    expect(tableNames).toContain('customers');
    expect(tableNames).toContain('categories');
    expect(tableNames).toContain('sync_logs');

    // Every call to where should include store_id
    const whereCalls = mockQueryBuilder.where.mock.calls;
    // stores query uses {id: storeId}
    expect(whereCalls[0][0]).toEqual({ id: storeId });
    // entity count queries use {store_id: storeId}
    expect(whereCalls[1][0]).toEqual({ store_id: storeId });
    expect(whereCalls[2][0]).toEqual({ store_id: storeId });
    expect(whereCalls[3][0]).toEqual({ store_id: storeId });
    expect(whereCalls[4][0]).toEqual({ store_id: storeId });
    // sync_logs query uses {store_id: storeId}
    expect(whereCalls[5][0]).toEqual({ store_id: storeId });
  });

  it('handles store not found gracefully (returns null lastSyncAt)', async () => {
    const storeId = 'store-nonexistent';

    // store lookup returns undefined
    mockQueryBuilder.first
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '0' });

    mockQueryBuilder.limit.mockResolvedValueOnce([]);

    const syncService = createSyncService({ db });
    const result = await syncService.getSyncStatus(storeId);

    expect(result.lastSyncAt).toBeNull();
  });

  it('maps sync log fields to camelCase correctly', async () => {
    const storeId = 'store-123';

    mockQueryBuilder.first
      .mockResolvedValueOnce({ last_sync_at: '2026-02-11T10:30:00Z' })
      .mockResolvedValueOnce({ count: '5' })
      .mockResolvedValueOnce({ count: '3' })
      .mockResolvedValueOnce({ count: '2' })
      .mockResolvedValueOnce({ count: '1' });

    mockQueryBuilder.limit.mockResolvedValueOnce([
      {
        id: 'log-fail',
        sync_type: 'webhook:products',
        records_synced: 0,
        status: 'failed',
        started_at: '2026-02-11T11:00:00Z',
        completed_at: '2026-02-11T11:00:01Z',
        error_message: 'Connection timeout',
      },
    ]);

    const syncService = createSyncService({ db });
    const result = await syncService.getSyncStatus(storeId);

    expect(result.recentSyncs[0]).toEqual({
      id: 'log-fail',
      syncType: 'webhook:products',
      recordsSynced: 0,
      status: 'failed',
      startedAt: '2026-02-11T11:00:00Z',
      completedAt: '2026-02-11T11:00:01Z',
      errorMessage: 'Connection timeout',
    });
  });

  it('converts count strings to numbers', async () => {
    const storeId = 'store-123';

    // PostgreSQL COUNT returns bigint as string
    mockQueryBuilder.first
      .mockResolvedValueOnce({ last_sync_at: null })
      .mockResolvedValueOnce({ count: '99999' })
      .mockResolvedValueOnce({ count: '0' })
      .mockResolvedValueOnce({ count: '500' })
      .mockResolvedValueOnce({ count: '25' });

    mockQueryBuilder.limit.mockResolvedValueOnce([]);

    const syncService = createSyncService({ db });
    const result = await syncService.getSyncStatus(storeId);

    expect(result.recordCounts.orders).toBe(99999);
    expect(typeof result.recordCounts.orders).toBe('number');
    expect(result.recordCounts.products).toBe(0);
    expect(result.recordCounts.customers).toBe(500);
    expect(result.recordCounts.categories).toBe(25);
  });
});
