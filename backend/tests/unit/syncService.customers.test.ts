import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHash } from 'node:crypto';
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
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'customer-uuid-1' }]),
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

function makeValidCustomer(overrides: Record<string, unknown> = {}) {
  return {
    wc_customer_id: 42,
    email: 'john@example.com',
    display_name: 'John D.',
    total_spent: 499.95,
    order_count: 5,
    first_order_date: '2025-06-01T00:00:00Z',
    last_order_date: '2026-01-15T10:30:00Z',
    created_at: '2025-05-20T00:00:00Z',
    ...overrides,
  };
}

describe('SyncService — upsertCustomers', () => {
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

  it('throws ValidationError when customers is not an array', async () => {
    const service = createSyncService({ db });

    await expect(
      service.upsertCustomers('store-123', 'not-an-array' as any), // eslint-disable-line @typescript-eslint/no-explicit-any
    ).rejects.toThrow(ValidationError);
  });

  it('returns 0 synced for empty customers array', async () => {
    const service = createSyncService({ db });

    const result = await service.upsertCustomers('store-123', []);

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

  it('creates sync log entry at start with sync_type customers', async () => {
    const service = createSyncService({ db });

    await service.upsertCustomers('store-123', []);

    expect(db).toHaveBeenCalledWith('sync_logs');
    expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: 'store-123',
        sync_type: 'customers',
        status: 'running',
      }),
    );
  });

  it('upserts a valid customer with ON CONFLICT merge', async () => {
    const service = createSyncService({ db });
    const result = await service.upsertCustomers('store-123', [makeValidCustomer()]);

    expect(result.syncedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(trxFn).toHaveBeenCalledWith('customers');
    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: 'store-123',
        wc_customer_id: 42,
        display_name: 'John D.',
        total_spent: 499.95,
        order_count: 5,
      }),
    );
    expect(trxQueryBuilder.onConflict).toHaveBeenCalledWith(['store_id', 'wc_customer_id']);
    expect(trxQueryBuilder.merge).toHaveBeenCalled();
  });

  it('hashes email with SHA256 before storage', async () => {
    const service = createSyncService({ db });
    await service.upsertCustomers('store-123', [makeValidCustomer()]);

    const expectedHash = createHash('sha256')
      .update('john@example.com')
      .digest('hex');

    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email_hash: expectedHash,
      }),
    );
  });

  it('normalizes email to lowercase before hashing', async () => {
    const service = createSyncService({ db });
    await service.upsertCustomers('store-123', [makeValidCustomer({ email: 'John@Example.COM' })]);

    const expectedHash = createHash('sha256')
      .update('john@example.com')
      .digest('hex');

    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email_hash: expectedHash,
      }),
    );
  });

  it('sets email_hash to null when email is not provided', async () => {
    const customer = makeValidCustomer();
    delete (customer as any).email; // eslint-disable-line @typescript-eslint/no-explicit-any

    const service = createSyncService({ db });
    await service.upsertCustomers('store-123', [customer]);

    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email_hash: null,
      }),
    );
  });

  it('skips invalid customers with missing wc_customer_id', async () => {
    const invalidCustomer = makeValidCustomer();
    delete (invalidCustomer as any).wc_customer_id; // eslint-disable-line @typescript-eslint/no-explicit-any

    const service = createSyncService({ db });
    const result = await service.upsertCustomers('store-123', [invalidCustomer]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('skips invalid customers with non-integer wc_customer_id', async () => {
    const service = createSyncService({ db });
    const result = await service.upsertCustomers('store-123', [
      makeValidCustomer({ wc_customer_id: 'not-a-number' }),
    ]);

    expect(result.syncedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it('handles mixed valid and invalid customers', async () => {
    const validCustomer = makeValidCustomer();
    const invalidCustomer = { email: 'no-id@test.com' }; // Missing wc_customer_id

    const service = createSyncService({ db });
    const result = await service.upsertCustomers('store-123', [validCustomer, invalidCustomer]);

    expect(result.syncedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it('completes sync log without transaction when all customers are invalid', async () => {
    const invalidCustomer = { email: 'no-id@test.com' };

    const service = createSyncService({ db });
    const result = await service.upsertCustomers('store-123', [invalidCustomer]);

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
    await service.upsertCustomers('store-123', [makeValidCustomer()]);

    expect(trxFn).toHaveBeenCalledWith('stores');
    expect(trxQueryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_sync_at: 'NOW()',
      }),
    );
  });

  it('commits transaction on success', async () => {
    const service = createSyncService({ db });
    await service.upsertCustomers('store-123', [makeValidCustomer()]);

    expect(trxFn.commit).toHaveBeenCalled();
  });

  it('marks sync log as completed on success', async () => {
    const service = createSyncService({ db });
    await service.upsertCustomers('store-123', [makeValidCustomer()]);

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
      service.upsertCustomers('store-123', [makeValidCustomer()]),
    ).rejects.toThrow(SyncError);

    expect(trxFn.rollback).toHaveBeenCalled();
    expect(mockQueryBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error_message: 'DB connection failed',
      }),
    );
  });

  it('defaults total_spent and order_count to 0 when not provided', async () => {
    const customer = makeValidCustomer();
    delete (customer as any).total_spent; // eslint-disable-line @typescript-eslint/no-explicit-any
    delete (customer as any).order_count; // eslint-disable-line @typescript-eslint/no-explicit-any

    const service = createSyncService({ db });
    await service.upsertCustomers('store-123', [customer]);

    expect(trxQueryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        total_spent: 0,
        order_count: 0,
      }),
    );
  });

  it('processes multiple valid customers in sequence', async () => {
    const customer1 = makeValidCustomer({ wc_customer_id: 42 });
    const customer2 = makeValidCustomer({ wc_customer_id: 43, email: 'jane@example.com' });

    const service = createSyncService({ db });
    const result = await service.upsertCustomers('store-123', [customer1, customer2]);

    expect(result.syncedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
  });
});
