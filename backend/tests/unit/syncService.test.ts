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

// Dynamic import AFTER mocks are set up
const { createSyncService } = await import('../../src/services/syncService.js');

interface MockQueryBuilder {
  where: jest.Mock;
  first: jest.Mock<() => Promise<unknown>>;
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
    first: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'sync-log-uuid' }]),
    update: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    del: jest.fn<() => Promise<number>>().mockResolvedValue(0),
    onConflict: jest.fn().mockReturnThis(),
    merge: jest.fn().mockReturnThis(),
  };

  // Transaction query builder (separate instance for trx calls)
  const trxQueryBuilder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    first: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'order-uuid-1' }]),
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

function makeValidOrder(overrides: Record<string, unknown> = {}) {
  return {
    wc_order_id: 1001,
    date_created: '2026-01-15T10:30:00Z',
    date_modified: '2026-01-15T12:00:00Z',
    status: 'completed',
    total: 99.99,
    subtotal: 89.99,
    tax_total: 5.0,
    shipping_total: 5.0,
    discount_total: 0,
    currency: 'USD',
    customer_id: 42,
    payment_method: 'stripe',
    coupon_used: '',
    items: [
      {
        wc_product_id: 501,
        product_name: 'Blue Widget',
        sku: 'BW-001',
        quantity: 2,
        subtotal: 44.99,
        total: 49.99,
      },
    ],
    ...overrides,
  };
}

describe('SyncService', () => {
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

  describe('upsertOrders', () => {
    it('throws ValidationError when orders is not an array', async () => {
      const service = createSyncService({ db });

      await expect(
        service.upsertOrders('store-123', 'not-an-array' as any), // eslint-disable-line @typescript-eslint/no-explicit-any
      ).rejects.toThrow(ValidationError);
    });

    it('returns 0 synced for empty orders array', async () => {
      const service = createSyncService({ db });

      const result = await service.upsertOrders('store-123', []);

      expect(result.syncedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
      expect(result.syncLogId).toBe('sync-log-uuid');
      // sync log should be created and immediately completed
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          records_synced: 0,
        }),
      );
    });

    it('creates sync log entry at start', async () => {
      const service = createSyncService({ db });

      await service.upsertOrders('store-123', []);

      // First call to db('sync_logs').insert()
      expect(db).toHaveBeenCalledWith('sync_logs');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          store_id: 'store-123',
          sync_type: 'orders',
          status: 'running',
        }),
      );
    });

    it('upserts a valid order with ON CONFLICT merge', async () => {
      // trx('orders').insert().onConflict().merge().returning()
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const service = createSyncService({ db });
      const result = await service.upsertOrders('store-123', [makeValidOrder()]);

      expect(result.syncedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      // Verify trx was used for the order insert
      expect(trxFn).toHaveBeenCalledWith('orders');
      expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          store_id: 'store-123',
          wc_order_id: 1001,
          status: 'completed',
          total: 99.99,
        }),
      );
      expect(trxQueryBuilder.onConflict).toHaveBeenCalledWith(['store_id', 'wc_order_id']);
      expect(trxQueryBuilder.merge).toHaveBeenCalled();
    });

    it('deletes old order items before inserting new ones', async () => {
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const service = createSyncService({ db });
      await service.upsertOrders('store-123', [makeValidOrder()]);

      // Verify delete of old order items
      expect(trxFn).toHaveBeenCalledWith('order_items');
      expect(trxQueryBuilder.where).toHaveBeenCalledWith({
        order_id: 'order-uuid-1',
        store_id: 'store-123',
      });
      expect(trxQueryBuilder.del).toHaveBeenCalled();
    });

    it('inserts order items with store_id', async () => {
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const service = createSyncService({ db });
      await service.upsertOrders('store-123', [makeValidOrder()]);

      // Verify order items insertion includes store_id
      expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            order_id: 'order-uuid-1',
            store_id: 'store-123',
            product_name: 'Blue Widget',
            sku: 'BW-001',
            quantity: 2,
          }),
        ]),
      );
    });

    it('resolves customer UUID from wc_customer_id', async () => {
      // First trx('customers').where().first() returns a customer
      trxQueryBuilder.first.mockResolvedValueOnce({ id: 'customer-uuid-42' });
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const service = createSyncService({ db });
      await service.upsertOrders('store-123', [makeValidOrder()]);

      // Should look up customer
      expect(trxFn).toHaveBeenCalledWith('customers');
      expect(trxQueryBuilder.where).toHaveBeenCalledWith({
        store_id: 'store-123',
        wc_customer_id: 42,
      });
      // Order insert should contain resolved customer UUID
      expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: 'customer-uuid-42',
        }),
      );
    });

    it('sets customer_id to null when customer not found', async () => {
      // trx('customers').where().first() returns undefined
      trxQueryBuilder.first.mockResolvedValueOnce(undefined);
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const service = createSyncService({ db });
      await service.upsertOrders('store-123', [makeValidOrder()]);

      expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: null,
        }),
      );
    });

    it('skips invalid orders with missing wc_order_id', async () => {
      const invalidOrder = makeValidOrder();
      delete (invalidOrder as any).wc_order_id; // eslint-disable-line @typescript-eslint/no-explicit-any

      const service = createSyncService({ db });
      const result = await service.upsertOrders('store-123', [invalidOrder]);

      expect(result.syncedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
    });

    it('skips invalid orders with missing status', async () => {
      const invalidOrder = makeValidOrder({ status: undefined });
      delete (invalidOrder as any).status; // eslint-disable-line @typescript-eslint/no-explicit-any

      const service = createSyncService({ db });
      const result = await service.upsertOrders('store-123', [invalidOrder]);

      expect(result.syncedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
    });

    it('skips invalid orders with non-integer wc_order_id', async () => {
      const service = createSyncService({ db });
      const result = await service.upsertOrders('store-123', [
        makeValidOrder({ wc_order_id: 'not-a-number' }),
      ]);

      expect(result.syncedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
    });

    it('handles mixed valid and invalid orders', async () => {
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const validOrder = makeValidOrder();
      const invalidOrder = { status: 'completed' }; // Missing wc_order_id, date_created, total

      const service = createSyncService({ db });
      const result = await service.upsertOrders('store-123', [validOrder, invalidOrder]);

      expect(result.syncedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
    });

    it('updates store.last_sync_at on success', async () => {
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const service = createSyncService({ db });
      await service.upsertOrders('store-123', [makeValidOrder()]);

      // trx('stores').where({ id: storeId }).update({ last_sync_at })
      expect(trxFn).toHaveBeenCalledWith('stores');
      expect(trxQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          last_sync_at: 'NOW()',
        }),
      );
    });

    it('commits transaction on success', async () => {
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const service = createSyncService({ db });
      await service.upsertOrders('store-123', [makeValidOrder()]);

      expect(trxFn.commit).toHaveBeenCalled();
    });

    it('marks sync log as completed on success', async () => {
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const service = createSyncService({ db });
      await service.upsertOrders('store-123', [makeValidOrder()]);

      // Last db('sync_logs').where().update() call should mark completed
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          records_synced: 1,
        }),
      );
    });

    it('rolls back transaction and marks sync log as failed on DB error', async () => {
      trxQueryBuilder.insert.mockImplementationOnce(() => {
        throw new Error('DB connection failed');
      });

      const service = createSyncService({ db });

      await expect(
        service.upsertOrders('store-123', [makeValidOrder()]),
      ).rejects.toThrow(SyncError);

      expect(trxFn.rollback).toHaveBeenCalled();
      // Sync log should be marked as failed
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'DB connection failed',
        }),
      );
    });

    it('handles order with no items', async () => {
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const orderNoItems = makeValidOrder({ items: [] });
      const service = createSyncService({ db });
      const result = await service.upsertOrders('store-123', [orderNoItems]);

      expect(result.syncedCount).toBe(1);
      // Should still delete old items but not insert new ones
      expect(trxQueryBuilder.del).toHaveBeenCalled();
    });

    it('handles order with undefined items', async () => {
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const orderNoItems = makeValidOrder();
      delete (orderNoItems as any).items; // eslint-disable-line @typescript-eslint/no-explicit-any

      const service = createSyncService({ db });
      const result = await service.upsertOrders('store-123', [orderNoItems]);

      expect(result.syncedCount).toBe(1);
    });

    it('resolves product UUID for order items when available', async () => {
      // First call: customer lookup (undefined)
      trxQueryBuilder.first.mockResolvedValueOnce(undefined);
      // After order upsert
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);
      // Product lookup returns a product
      trxQueryBuilder.first.mockResolvedValueOnce({ id: 'product-uuid-501' });

      const service = createSyncService({ db });
      await service.upsertOrders('store-123', [makeValidOrder({ customer_id: 0 })]);

      expect(trxFn).toHaveBeenCalledWith('products');
    });

    it('defaults currency to USD when not provided', async () => {
      trxQueryBuilder.returning.mockResolvedValueOnce([{ id: 'order-uuid-1' }]);

      const orderNoCurrency = makeValidOrder({ customer_id: 0 });
      delete (orderNoCurrency as any).currency; // eslint-disable-line @typescript-eslint/no-explicit-any

      const service = createSyncService({ db });
      await service.upsertOrders('store-123', [orderNoCurrency]);

      expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'USD',
        }),
      );
    });

    it('processes multiple valid orders in sequence', async () => {
      trxQueryBuilder.returning
        .mockResolvedValueOnce([{ id: 'order-uuid-1' }])
        .mockResolvedValueOnce([{ id: 'order-uuid-2' }]);

      const order1 = makeValidOrder({ wc_order_id: 1001, customer_id: 0, items: [] });
      const order2 = makeValidOrder({ wc_order_id: 1002, customer_id: 0, items: [] });

      const service = createSyncService({ db });
      const result = await service.upsertOrders('store-123', [order1, order2]);

      expect(result.syncedCount).toBe(2);
      expect(result.skippedCount).toBe(0);
    });
  });
});
