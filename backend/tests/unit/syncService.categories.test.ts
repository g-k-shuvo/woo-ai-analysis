import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ValidationError, SyncError } from '../../src/utils/errors.js';

// ESM-compatible mocks — must be set up BEFORE dynamic import
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

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
  };

  const trxQueryBuilder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn<(column: string, values: unknown[]) => Promise<unknown[]>>().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'category-uuid-1' }]),
    update: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    del: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    onConflict: jest.fn().mockReturnThis(),
    merge: jest.fn().mockReturnThis(),
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

function makeValidCategory(overrides: Record<string, unknown> = {}) {
  return {
    wc_category_id: 10,
    name: 'Widgets',
    parent_id: null,
    product_count: 25,
    ...overrides,
  };
}

describe('SyncService — upsertCategories', () => {
  let db: ReturnType<typeof createMockDb>['db'];
  let mockQueryBuilder: ReturnType<typeof createMockDb>['mockQueryBuilder'];
  let trxQueryBuilder: ReturnType<typeof createMockDb>['trxQueryBuilder'];
  let trxFn: ReturnType<typeof createMockDb>['trxFn'];

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMockDb();
    db = mocks.db;
    mockQueryBuilder = mocks.mockQueryBuilder;
    trxQueryBuilder = mocks.trxQueryBuilder;
    trxFn = mocks.trxFn;
  });

  it('throws ValidationError when categories is not an array', async () => {
    const service = createSyncService({ db });

    await expect(
      service.upsertCategories('store-123', 'not-an-array' as any), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toThrow(ValidationError);
  });

  it('returns 0 synced for empty categories array', async () => {
    const service = createSyncService({ db });

    const result = await service.upsertCategories('store-123', []);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.syncLogId).toBe('sync-log-uuid');
    expect(mockQueryBuilder.insert).toHaveBeenCalled();
    expect(mockQueryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        records_synced: 0,
      }),
    );
  });

  it('creates sync log entry at start with sync_type categories', async () => {
    const service = createSyncService({ db });

    await service.upsertCategories('store-123', []);

    expect(db).toHaveBeenCalledWith('sync_logs');
    expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: 'store-123',
        sync_type: 'categories',
        status: 'running',
      }),
    );
  });

  it('upserts a valid category with ON CONFLICT merge', async () => {
    const service = createSyncService({ db });
    const result = await service.upsertCategories('store-123', [makeValidCategory()]);

    expect(result.syncedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(trxFn).toHaveBeenCalledWith('categories');
    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: 'store-123',
        wc_category_id: 10,
        name: 'Widgets',
        product_count: 25,
      }),
    );
    expect(trxQueryBuilder.onConflict).toHaveBeenCalledWith(['store_id', 'wc_category_id']);
    expect(trxQueryBuilder.merge).toHaveBeenCalled();
  });

  it('resolves parent_id by wc_category_id lookup', async () => {
    // fetchIdsToMap for parent categories returns a match
    trxQueryBuilder.whereIn.mockResolvedValueOnce([
      { id: 'parent-uuid-5', wc_category_id: 5 },
    ]);

    const service = createSyncService({ db });
    await service.upsertCategories('store-123', [makeValidCategory({ parent_id: 5 })]);

    expect(trxFn).toHaveBeenCalledWith('categories');
    expect(trxQueryBuilder.select).toHaveBeenCalledWith('id', 'wc_category_id');
    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: 'parent-uuid-5',
      }),
    );
  });

  it('sets parent_id to null when parent category not found', async () => {
    trxQueryBuilder.whereIn.mockResolvedValueOnce([]);

    const service = createSyncService({ db });
    await service.upsertCategories('store-123', [makeValidCategory({ parent_id: 99 })]);

    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: null,
      }),
    );
  });

  it('sets parent_id to null when parent_id is null', async () => {
    const service = createSyncService({ db });
    await service.upsertCategories('store-123', [makeValidCategory({ parent_id: null })]);

    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: null,
      }),
    );
  });

  it('skips invalid categories with missing wc_category_id', async () => {
    const invalidCategory = makeValidCategory();
    delete (invalidCategory as any).wc_category_id; // eslint-disable-line @typescript-eslint/no-explicit-any

    const service = createSyncService({ db });
    const result = await service.upsertCategories('store-123', [invalidCategory]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('skips invalid categories with missing name', async () => {
    const invalidCategory = makeValidCategory({ name: undefined });
    delete (invalidCategory as any).name; // eslint-disable-line @typescript-eslint/no-explicit-any

    const service = createSyncService({ db });
    const result = await service.upsertCategories('store-123', [invalidCategory]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('skips invalid categories with non-integer wc_category_id', async () => {
    const service = createSyncService({ db });
    const result = await service.upsertCategories('store-123', [
      makeValidCategory({ wc_category_id: 'not-a-number' }),
    ]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('handles mixed valid and invalid categories', async () => {
    const validCategory = makeValidCategory();
    const invalidCategory = { product_count: 5 }; // Missing wc_category_id, name

    const service = createSyncService({ db });
    const result = await service.upsertCategories('store-123', [validCategory, invalidCategory]);

    expect(result.syncedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it('completes sync log without transaction when all categories are invalid', async () => {
    const invalidCategory = { product_count: 5 };

    const service = createSyncService({ db });
    const result = await service.upsertCategories('store-123', [invalidCategory]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(mockQueryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        records_synced: 0,
      }),
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('updates store.last_sync_at on success', async () => {
    const service = createSyncService({ db });
    await service.upsertCategories('store-123', [makeValidCategory()]);

    expect(trxFn).toHaveBeenCalledWith('stores');
    expect(trxQueryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_sync_at: 'NOW()',
      }),
    );
  });

  it('commits transaction on success', async () => {
    const service = createSyncService({ db });
    await service.upsertCategories('store-123', [makeValidCategory()]);

    expect(trxFn.commit).toHaveBeenCalled();
  });

  it('marks sync log as completed on success', async () => {
    const service = createSyncService({ db });
    await service.upsertCategories('store-123', [makeValidCategory()]);

    expect(mockQueryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        records_synced: 1,
      }),
    );
  });

  it('rolls back transaction and marks sync log as failed on DB error', async () => {
    trxQueryBuilder.select.mockImplementationOnce(() => {
      throw new Error('DB connection failed');
    });

    const service = createSyncService({ db });

    await expect(
      service.upsertCategories('store-123', [makeValidCategory({ parent_id: 5 })]),
    ).rejects.toThrow(SyncError);

    expect(trxFn.rollback).toHaveBeenCalled();
    expect(mockQueryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: 'DB connection failed',
      }),
    );
  });

  it('defaults product_count to 0 when not provided', async () => {
    const category = makeValidCategory();
    delete (category as any).product_count; // eslint-disable-line @typescript-eslint/no-explicit-any

    const service = createSyncService({ db });
    await service.upsertCategories('store-123', [category]);

    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        product_count: 0,
      }),
    );
  });

  it('processes multiple valid categories in sequence', async () => {
    const category1 = makeValidCategory({ wc_category_id: 10 });
    const category2 = makeValidCategory({ wc_category_id: 11, name: 'Gadgets' });

    const service = createSyncService({ db });
    const result = await service.upsertCategories('store-123', [category1, category2]);

    expect(result.syncedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
  });

  it('skips parent fetch when no categories have parent_id', async () => {
    const service = createSyncService({ db });
    await service.upsertCategories('store-123', [makeValidCategory({ parent_id: null })]);

    const selectCalls = trxQueryBuilder.select.mock.calls;
    const parentSelectCall = selectCalls.find(
      (call: unknown[]) => call[1] === 'wc_category_id',
    );
    expect(parentSelectCall).toBeUndefined();
  });
});
