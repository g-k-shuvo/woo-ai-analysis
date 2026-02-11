import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createCustomerQueries } = await import('../../../src/ai/customerQueries.js');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ──────────────────────────────────────────────────────────

const VALID_STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.Mock<(...args: any[]) => any>;

interface MockQueryBuilder {
  where: AnyMock;
  whereIn: AnyMock;
  whereRaw: AnyMock;
  whereNotNull: AnyMock;
  select: AnyMock;
  first: AnyMock;
  groupBy: AnyMock;
  groupByRaw: AnyMock;
  orderBy: AnyMock;
  orderByRaw: AnyMock;
  limit: AnyMock;
  join: AnyMock;
}

function createMockQueryBuilder(
  allResults: Array<Record<string, unknown>> | Record<string, unknown> = [],
): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    where: jest.fn(),
    whereIn: jest.fn(),
    whereRaw: jest.fn(),
    whereNotNull: jest.fn(),
    select: jest.fn(),
    first: jest.fn(),
    groupBy: jest.fn(),
    groupByRaw: jest.fn(),
    orderBy: jest.fn(),
    orderByRaw: jest.fn(),
    limit: jest.fn(),
    join: jest.fn(),
  };

  // Chain all methods back to builder
  builder.where.mockReturnValue(builder);
  builder.whereIn.mockReturnValue(builder);
  builder.whereRaw.mockReturnValue(builder);
  builder.whereNotNull.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.groupBy.mockReturnValue(builder);
  builder.groupByRaw.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  builder.orderByRaw.mockReturnValue(builder);
  builder.join.mockReturnValue(builder);

  if (Array.isArray(allResults)) {
    builder.limit.mockResolvedValue(allResults);
    builder.first.mockResolvedValue(allResults[0] ?? undefined);
    // For groupByRaw terminal (newVsReturning uses groupByRaw as terminal)
    // The chain ends at groupByRaw which returns builder, then the resolved value comes from the Knex promise
  } else {
    builder.limit.mockResolvedValue([allResults]);
    builder.first.mockResolvedValue(allResults);
  }

  return builder;
}

function createMockDb(builders: MockQueryBuilder | MockQueryBuilder[]) {
  const builderArray = Array.isArray(builders) ? [...builders] : [builders];
  let callIndex = 0;

  const mockDb = jest.fn(() => {
    const builder = builderArray[callIndex] ?? builderArray[builderArray.length - 1];
    callIndex++;
    return builder;
  });

  // Attach raw for select expressions
  (mockDb as unknown as Record<string, unknown>).raw = jest.fn(
    (expr: string) => ({ toString: () => expr }),
  );

  return mockDb;
}

describe('createCustomerQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── newVsReturning ──────────────────────────────────────────

  describe('newVsReturning', () => {
    it('returns correct new, returning, and total counts', async () => {
      const builder = createMockQueryBuilder([
        { customer_type: 'new', customer_count: '25' },
        { customer_type: 'returning', customer_count: '15' },
      ]);
      // newVsReturning ends at groupByRaw which returns a thenable (Promise)
      builder.groupByRaw.mockResolvedValue([
        { customer_type: 'new', customer_count: '25' },
        { customer_type: 'returning', customer_count: '15' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newVsReturning(VALID_STORE_ID);

      expect(result).toEqual({
        newCustomers: 25,
        returningCustomers: 15,
        totalCustomers: 40,
      });
    });

    it('returns zeros when no customers exist', async () => {
      const builder = createMockQueryBuilder([]);
      builder.groupByRaw.mockResolvedValue([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newVsReturning(VALID_STORE_ID);

      expect(result).toEqual({
        newCustomers: 0,
        returningCustomers: 0,
        totalCustomers: 0,
      });
    });

    it('handles only new customers (no returning)', async () => {
      const builder = createMockQueryBuilder([]);
      builder.groupByRaw.mockResolvedValue([
        { customer_type: 'new', customer_count: '10' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newVsReturning(VALID_STORE_ID);

      expect(result).toEqual({
        newCustomers: 10,
        returningCustomers: 0,
        totalCustomers: 10,
      });
    });

    it('handles only returning customers (no new)', async () => {
      const builder = createMockQueryBuilder([]);
      builder.groupByRaw.mockResolvedValue([
        { customer_type: 'returning', customer_count: '5' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newVsReturning(VALID_STORE_ID);

      expect(result).toEqual({
        newCustomers: 0,
        returningCustomers: 5,
        totalCustomers: 5,
      });
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder([]);
      builder.groupByRaw.mockResolvedValue([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.newVsReturning(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
    });

    it('filters for customers with at least 1 order', async () => {
      const builder = createMockQueryBuilder([]);
      builder.groupByRaw.mockResolvedValue([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.newVsReturning(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith('order_count', '>', 0);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.newVsReturning('not-a-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for empty storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.newVsReturning('')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.groupByRaw.mockRejectedValue(new Error('connection refused'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.newVsReturning(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch new vs returning customers',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder([]);
      builder.groupByRaw.mockResolvedValue([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.newVsReturning(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID },
        'Customer query: newVsReturning start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
        }),
        'Customer query: newVsReturning completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder([]);
      builder.groupByRaw.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      try {
        await queries.newVsReturning(VALID_STORE_ID);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db error',
        }),
        'Customer query: newVsReturning failed',
      );
    });
  });

  // ── topCustomersBySpending ──────────────────────────────────

  describe('topCustomersBySpending', () => {
    it('returns customers sorted by total_spent', async () => {
      const builder = createMockQueryBuilder([
        { display_name: 'Alice', total_spent: '5000.00', order_count: '10' },
        { display_name: 'Bob', total_spent: '3000.00', order_count: '5' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.topCustomersBySpending(VALID_STORE_ID);

      expect(result).toEqual([
        { displayName: 'Alice', totalSpent: 5000, orderCount: 10 },
        { displayName: 'Bob', totalSpent: 3000, orderCount: 5 },
      ]);
    });

    it('defaults to limit 10', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.topCustomersBySpending(VALID_STORE_ID);

      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it('respects custom limit', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.topCustomersBySpending(VALID_STORE_ID, 5);

      expect(builder.limit).toHaveBeenCalledWith(5);
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.topCustomersBySpending(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
    });

    it('filters for customers with at least 1 order', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.topCustomersBySpending(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith('order_count', '>', 0);
    });

    it('returns empty array when no customers exist', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.topCustomersBySpending(VALID_STORE_ID);

      expect(result).toEqual([]);
    });

    it('parses monetary values from DB (DB handles rounding via ROUND)', async () => {
      // DB returns pre-rounded values via ROUND(total_spent, 2)
      const builder = createMockQueryBuilder([
        { display_name: 'Alice', total_spent: '123.57', order_count: '3' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.topCustomersBySpending(VALID_STORE_ID);

      expect(result[0].totalSpent).toBe(123.57);
    });

    it('handles null display_name as Anonymous', async () => {
      const builder = createMockQueryBuilder([
        { display_name: null, total_spent: '100.00', order_count: '1' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.topCustomersBySpending(VALID_STORE_ID);

      expect(result[0].displayName).toBe('Anonymous');
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.topCustomersBySpending('not-a-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for empty storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.topCustomersBySpending('')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for limit < 1', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.topCustomersBySpending(VALID_STORE_ID, 0)).rejects.toThrow(
        'limit must be an integer between 1 and 100',
      );
    });

    it('throws ValidationError for limit > 100', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.topCustomersBySpending(VALID_STORE_ID, 101)).rejects.toThrow(
        'limit must be an integer between 1 and 100',
      );
    });

    it('throws ValidationError for non-integer limit', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.topCustomersBySpending(VALID_STORE_ID, 3.5)).rejects.toThrow(
        'limit must be an integer between 1 and 100',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('connection refused'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.topCustomersBySpending(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch top customers by spending',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder([
        { display_name: 'Alice', total_spent: '100', order_count: '1' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.topCustomersBySpending(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID, limit: 10 },
        'Customer query: topCustomersBySpending start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
          resultCount: 1,
        }),
        'Customer query: topCustomersBySpending completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      try {
        await queries.topCustomersBySpending(VALID_STORE_ID);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db error',
        }),
        'Customer query: topCustomersBySpending failed',
      );
    });
  });

  // ── topCustomersByOrderCount ────────────────────────────────

  describe('topCustomersByOrderCount', () => {
    it('returns customers sorted by order_count', async () => {
      const builder = createMockQueryBuilder([
        { display_name: 'Charlie', total_spent: '2000.00', order_count: '25' },
        { display_name: 'Diana', total_spent: '5000.00', order_count: '10' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.topCustomersByOrderCount(VALID_STORE_ID);

      expect(result).toEqual([
        { displayName: 'Charlie', totalSpent: 2000, orderCount: 25 },
        { displayName: 'Diana', totalSpent: 5000, orderCount: 10 },
      ]);
    });

    it('defaults to limit 10', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.topCustomersByOrderCount(VALID_STORE_ID);

      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it('respects custom limit', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.topCustomersByOrderCount(VALID_STORE_ID, 20);

      expect(builder.limit).toHaveBeenCalledWith(20);
    });

    it('filters by store_id and order_count > 0', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.topCustomersByOrderCount(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
      expect(builder.where).toHaveBeenCalledWith('order_count', '>', 0);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.topCustomersByOrderCount('bad')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('timeout'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.topCustomersByOrderCount(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch top customers by order count',
      );
    });
  });

  // ── newCustomersByPeriod ────────────────────────────────────

  describe('newCustomersByPeriod', () => {
    it('returns count of new customers for today', async () => {
      const builder = createMockQueryBuilder({ customer_count: '5' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByPeriod(VALID_STORE_ID, 'today');

      expect(result).toEqual({ count: 5 });
    });

    it('returns count for this_week', async () => {
      const builder = createMockQueryBuilder({ customer_count: '12' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByPeriod(VALID_STORE_ID, 'this_week');

      expect(result).toEqual({ count: 12 });
    });

    it('returns count for this_month', async () => {
      const builder = createMockQueryBuilder({ customer_count: '42' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByPeriod(VALID_STORE_ID, 'this_month');

      expect(result).toEqual({ count: 42 });
    });

    it('returns count for this_year', async () => {
      const builder = createMockQueryBuilder({ customer_count: '200' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByPeriod(VALID_STORE_ID, 'this_year');

      expect(result).toEqual({ count: 200 });
    });

    it('returns count for last_7_days', async () => {
      const builder = createMockQueryBuilder({ customer_count: '8' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByPeriod(VALID_STORE_ID, 'last_7_days');

      expect(result).toEqual({ count: 8 });
    });

    it('returns count for last_30_days', async () => {
      const builder = createMockQueryBuilder({ customer_count: '35' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByPeriod(VALID_STORE_ID, 'last_30_days');

      expect(result).toEqual({ count: 35 });
    });

    it('returns 0 when no new customers', async () => {
      const builder = createMockQueryBuilder({ customer_count: '0' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByPeriod(VALID_STORE_ID, 'today');

      expect(result).toEqual({ count: 0 });
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder({ customer_count: '0' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.newCustomersByPeriod(VALID_STORE_ID, 'today');

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
    });

    it('applies whereRaw for date filtering', async () => {
      const builder = createMockQueryBuilder({ customer_count: '0' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.newCustomersByPeriod(VALID_STORE_ID, 'today');

      expect(builder.whereRaw).toHaveBeenCalled();
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.newCustomersByPeriod('bad-uuid', 'today')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for invalid period', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.newCustomersByPeriod(VALID_STORE_ID, 'invalid_period' as never),
      ).rejects.toThrow('Invalid period: must be one of');
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('connection error'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.newCustomersByPeriod(VALID_STORE_ID, 'today')).rejects.toThrow(
        'Failed to fetch new customers for period: today',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder({ customer_count: '3' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.newCustomersByPeriod(VALID_STORE_ID, 'this_month');

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID, period: 'this_month' },
        'Customer query: newCustomersByPeriod start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
        }),
        'Customer query: newCustomersByPeriod completed',
      );
    });
  });

  // ── newCustomersByDateRange ─────────────────────────────────

  describe('newCustomersByDateRange', () => {
    it('returns count of new customers for date range', async () => {
      const builder = createMockQueryBuilder({ customer_count: '15' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByDateRange(
        VALID_STORE_ID,
        '2026-01-01',
        '2026-02-01',
      );

      expect(result).toEqual({ count: 15 });
    });

    it('filters by store_id and date range (inclusive end)', async () => {
      const builder = createMockQueryBuilder({ customer_count: '0' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.newCustomersByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01');

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
      expect(builder.where).toHaveBeenCalledWith('first_order_date', '>=', '2026-01-01');
      // Date-only endDate is made inclusive by converting to end-of-day
      expect(builder.where).toHaveBeenCalledWith('first_order_date', '<=', '2026-02-01T23:59:59.999Z');
    });

    it('returns 0 when no new customers in range', async () => {
      const builder = createMockQueryBuilder({ customer_count: '0' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByDateRange(
        VALID_STORE_ID,
        '2026-01-01',
        '2026-02-01',
      );

      expect(result).toEqual({ count: 0 });
    });

    it('handles undefined row gracefully', async () => {
      const builder = createMockQueryBuilder([]);
      builder.first.mockResolvedValue(undefined);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByDateRange(
        VALID_STORE_ID,
        '2026-01-01',
        '2026-02-01',
      );

      expect(result).toEqual({ count: 0 });
    });

    it('accepts ISO 8601 datetime format', async () => {
      const builder = createMockQueryBuilder({ customer_count: '7' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.newCustomersByDateRange(
        VALID_STORE_ID,
        '2026-01-01T00:00:00Z',
        '2026-02-01T00:00:00Z',
      );

      expect(result).toEqual({ count: 7 });
    });

    it('throws ValidationError for invalid startDate', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.newCustomersByDateRange(VALID_STORE_ID, 'not-a-date', '2026-02-01'),
      ).rejects.toThrow('Invalid startDate');
    });

    it('throws ValidationError for invalid endDate', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.newCustomersByDateRange(VALID_STORE_ID, '2026-01-01', 'bad'),
      ).rejects.toThrow('Invalid endDate');
    });

    it('throws ValidationError when startDate is after endDate', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.newCustomersByDateRange(VALID_STORE_ID, '2026-03-01', '2026-01-01'),
      ).rejects.toThrow('startDate must be before or equal to endDate');
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.newCustomersByDateRange('bad', '2026-01-01', '2026-02-01'),
      ).rejects.toThrow('Invalid storeId: must be a valid UUID');
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('connection error'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.newCustomersByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01'),
      ).rejects.toThrow('Failed to fetch new customers for date range');
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder({ customer_count: '0' });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.newCustomersByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01');

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID, startDate: '2026-01-01', endDate: '2026-02-01' },
        'Customer query: newCustomersByDateRange start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
        }),
        'Customer query: newCustomersByDateRange completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('db timeout'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      try {
        await queries.newCustomersByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01');
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db timeout',
        }),
        'Customer query: newCustomersByDateRange failed',
      );
    });
  });

  // ── customerLifetimeValue ───────────────────────────────────

  describe('customerLifetimeValue', () => {
    it('returns correct averages and total', async () => {
      const builder = createMockQueryBuilder({
        avg_total_spent: '250.50',
        avg_order_count: '3.20',
        total_customers: '100',
      });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.customerLifetimeValue(VALID_STORE_ID);

      expect(result).toEqual({
        avgTotalSpent: 250.5,
        avgOrderCount: 3.2,
        totalCustomers: 100,
      });
    });

    it('returns zeros when no customers exist', async () => {
      const builder = createMockQueryBuilder({
        avg_total_spent: '0',
        avg_order_count: '0',
        total_customers: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.customerLifetimeValue(VALID_STORE_ID);

      expect(result).toEqual({
        avgTotalSpent: 0,
        avgOrderCount: 0,
        totalCustomers: 0,
      });
    });

    it('handles undefined row gracefully', async () => {
      const builder = createMockQueryBuilder([]);
      builder.first.mockResolvedValue(undefined);
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.customerLifetimeValue(VALID_STORE_ID);

      expect(result).toEqual({
        avgTotalSpent: 0,
        avgOrderCount: 0,
        totalCustomers: 0,
      });
    });

    it('parses monetary values from DB (DB handles rounding via ROUND)', async () => {
      // DB returns pre-rounded values via ROUND(AVG(...), 2)
      const builder = createMockQueryBuilder({
        avg_total_spent: '123.57',
        avg_order_count: '2.33',
        total_customers: '50',
      });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      const result = await queries.customerLifetimeValue(VALID_STORE_ID);

      expect(result.avgTotalSpent).toBe(123.57);
      expect(result.avgOrderCount).toBe(2.33);
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder({
        avg_total_spent: '0',
        avg_order_count: '0',
        total_customers: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.customerLifetimeValue(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
    });

    it('filters for customers with at least 1 order', async () => {
      const builder = createMockQueryBuilder({
        avg_total_spent: '0',
        avg_order_count: '0',
        total_customers: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.customerLifetimeValue(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith('order_count', '>', 0);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.customerLifetimeValue('not-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('query error'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await expect(queries.customerLifetimeValue(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch customer lifetime value',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder({
        avg_total_spent: '100',
        avg_order_count: '2',
        total_customers: '50',
      });
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      await queries.customerLifetimeValue(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID },
        'Customer query: customerLifetimeValue start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
        }),
        'Customer query: customerLifetimeValue completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createCustomerQueries({ readonlyDb: mockDb as never });

      try {
        await queries.customerLifetimeValue(VALID_STORE_ID);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db error',
        }),
        'Customer query: customerLifetimeValue failed',
      );
    });
  });
});
