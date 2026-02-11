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
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'product-uuid-1' }]),
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

function makeValidProduct(overrides: Record<string, unknown> = {}) {
  return {
    wc_product_id: 501,
    name: 'Blue Widget',
    sku: 'BW-001',
    price: 24.99,
    regular_price: 29.99,
    sale_price: 24.99,
    category_id: 10,
    category_name: 'Widgets',
    stock_quantity: 50,
    stock_status: 'instock',
    status: 'publish',
    type: 'simple',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T10:30:00Z',
    ...overrides,
  };
}

describe('SyncService — upsertProducts', () => {
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

  it('throws ValidationError when products is not an array', async () => {
    const service = createSyncService({ db });

    await expect(
      service.upsertProducts('store-123', 'not-an-array' as any), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toThrow(ValidationError);
  });

  it('returns 0 synced for empty products array', async () => {
    const service = createSyncService({ db });

    const result = await service.upsertProducts('store-123', []);

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

  it('creates sync log entry at start with sync_type products', async () => {
    const service = createSyncService({ db });

    await service.upsertProducts('store-123', []);

    expect(db).toHaveBeenCalledWith('sync_logs');
    expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: 'store-123',
        sync_type: 'products',
        status: 'running',
      }),
    );
  });

  it('upserts a valid product with ON CONFLICT merge', async () => {
    const service = createSyncService({ db });
    const result = await service.upsertProducts('store-123', [makeValidProduct()]);

    expect(result.syncedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(trxFn).toHaveBeenCalledWith('products');
    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: 'store-123',
        wc_product_id: 501,
        name: 'Blue Widget',
        sku: 'BW-001',
        price: 24.99,
      }),
    );
    expect(trxQueryBuilder.onConflict).toHaveBeenCalledWith(['store_id', 'wc_product_id']);
    expect(trxQueryBuilder.merge).toHaveBeenCalled();
  });

  it('resolves category_id by wc_category_id lookup', async () => {
    // fetchIdsToMap for categories returns a match
    trxQueryBuilder.whereIn.mockResolvedValueOnce([
      { id: 'category-uuid-10', wc_category_id: 10 },
    ]);

    const service = createSyncService({ db });
    await service.upsertProducts('store-123', [makeValidProduct()]);

    expect(trxFn).toHaveBeenCalledWith('categories');
    expect(trxQueryBuilder.select).toHaveBeenCalledWith('id', 'wc_category_id');
    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: 'category-uuid-10',
      }),
    );
  });

  it('sets category_id to null when category not found', async () => {
    trxQueryBuilder.whereIn.mockResolvedValueOnce([]);

    const service = createSyncService({ db });
    await service.upsertProducts('store-123', [makeValidProduct()]);

    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: null,
      }),
    );
  });

  it('skips invalid products with missing wc_product_id', async () => {
    const invalidProduct = makeValidProduct();
    delete (invalidProduct as any).wc_product_id; // eslint-disable-line @typescript-eslint/no-explicit-any

    const service = createSyncService({ db });
    const result = await service.upsertProducts('store-123', [invalidProduct]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('skips invalid products with missing name', async () => {
    const invalidProduct = makeValidProduct({ name: undefined });
    delete (invalidProduct as any).name; // eslint-disable-line @typescript-eslint/no-explicit-any

    const service = createSyncService({ db });
    const result = await service.upsertProducts('store-123', [invalidProduct]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('skips invalid products with empty string name', async () => {
    const service = createSyncService({ db });
    const result = await service.upsertProducts('store-123', [
      makeValidProduct({ name: '' }),
    ]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('skips invalid products with whitespace-only name', async () => {
    const service = createSyncService({ db });
    const result = await service.upsertProducts('store-123', [
      makeValidProduct({ name: '   ' }),
    ]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('skips invalid products with non-integer wc_product_id', async () => {
    const service = createSyncService({ db });
    const result = await service.upsertProducts('store-123', [
      makeValidProduct({ wc_product_id: 'not-a-number' }),
    ]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('handles mixed valid and invalid products', async () => {
    const validProduct = makeValidProduct();
    const invalidProduct = { name: 'Missing ID' }; // Missing wc_product_id

    const service = createSyncService({ db });
    const result = await service.upsertProducts('store-123', [validProduct, invalidProduct]);

    expect(result.syncedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it('completes sync log without transaction when all products are invalid', async () => {
    const invalidProduct = { name: 'Missing ID' };

    const service = createSyncService({ db });
    const result = await service.upsertProducts('store-123', [invalidProduct]);

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
    await service.upsertProducts('store-123', [makeValidProduct()]);

    expect(trxFn).toHaveBeenCalledWith('stores');
    expect(trxQueryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_sync_at: 'NOW()',
      }),
    );
  });

  it('commits transaction on success', async () => {
    const service = createSyncService({ db });
    await service.upsertProducts('store-123', [makeValidProduct()]);

    expect(trxFn.commit).toHaveBeenCalled();
  });

  it('marks sync log as completed on success', async () => {
    const service = createSyncService({ db });
    await service.upsertProducts('store-123', [makeValidProduct()]);

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
      service.upsertProducts('store-123', [makeValidProduct()]),
    ).rejects.toThrow(SyncError);

    expect(trxFn.rollback).toHaveBeenCalled();
    expect(mockQueryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: 'DB connection failed',
      }),
    );
  });

  it('defaults status to publish and type to simple when not provided', async () => {
    const product = makeValidProduct({ category_id: 0 });
    delete (product as any).status; // eslint-disable-line @typescript-eslint/no-explicit-any
    delete (product as any).type; // eslint-disable-line @typescript-eslint/no-explicit-any

    const service = createSyncService({ db });
    await service.upsertProducts('store-123', [product]);

    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'publish',
        type: 'simple',
      }),
    );
  });

  it('processes multiple valid products in sequence', async () => {
    const product1 = makeValidProduct({ wc_product_id: 501, category_id: 0 });
    const product2 = makeValidProduct({ wc_product_id: 502, category_id: 0 });

    const service = createSyncService({ db });
    const result = await service.upsertProducts('store-123', [product1, product2]);

    expect(result.syncedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
  });

  it('skips category fetch when no products have category_id', async () => {
    const service = createSyncService({ db });
    await service.upsertProducts('store-123', [makeValidProduct({ category_id: 0 })]);

    const selectCalls = trxQueryBuilder.select.mock.calls;
    const categorySelectCall = selectCalls.find(
      (call: unknown[]) => call[1] === 'wc_category_id',
    );
    expect(categorySelectCall).toBeUndefined();
  });
});
