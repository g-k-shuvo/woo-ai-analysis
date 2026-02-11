import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createOrderQueries } = await import('../../../src/ai/orderQueries.js');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ──────────────────────────────────────────────────────────

const VALID_STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.Mock<(...args: any[]) => any>;

interface MockQueryBuilder {
  where: AnyMock;
  whereIn: AnyMock;
  whereRaw: AnyMock;
  select: AnyMock;
  first: AnyMock;
  count: AnyMock;
  groupBy: AnyMock;
  groupByRaw: AnyMock;
  orderBy: AnyMock;
  orderByRaw: AnyMock;
  limit: AnyMock;
}

function createMockQueryBuilder(
  allResults: Array<Record<string, unknown>> | Record<string, unknown> = [],
): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    where: jest.fn(),
    whereIn: jest.fn(),
    whereRaw: jest.fn(),
    select: jest.fn(),
    first: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    groupByRaw: jest.fn(),
    orderBy: jest.fn(),
    orderByRaw: jest.fn(),
    limit: jest.fn(),
  };

  // Chain all methods back to builder
  builder.where.mockReturnValue(builder);
  builder.whereIn.mockReturnValue(builder);
  builder.whereRaw.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.count.mockReturnValue(builder);
  builder.groupBy.mockReturnValue(builder);
  builder.groupByRaw.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  builder.orderByRaw.mockReturnValue(builder);

  if (Array.isArray(allResults)) {
    builder.limit.mockResolvedValue(allResults);
    builder.first.mockResolvedValue(allResults[0] ?? undefined);
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

describe('createOrderQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── orderCount ──────────────────────────────────────────────

  describe('orderCount', () => {
    it('returns correct count, revenue, and avgOrderValue', async () => {
      const builder = createMockQueryBuilder({
        order_count: '42',
        total_revenue: '5250.00',
        avg_order_value: '125.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.orderCount(VALID_STORE_ID);

      expect(result).toEqual({
        orderCount: 42,
        revenue: 5250,
        avgOrderValue: 125,
      });
    });

    it('returns zeros when no orders exist', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.orderCount(VALID_STORE_ID);

      expect(result).toEqual({
        orderCount: 0,
        revenue: 0,
        avgOrderValue: 0,
      });
    });

    it('handles undefined row gracefully', async () => {
      const builder = createMockQueryBuilder([]);
      builder.first.mockResolvedValue(undefined);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.orderCount(VALID_STORE_ID);

      expect(result).toEqual({
        orderCount: 0,
        revenue: 0,
        avgOrderValue: 0,
      });
    });

    it('rounds monetary values to 2 decimal places', async () => {
      const builder = createMockQueryBuilder({
        order_count: '3',
        total_revenue: '100.456',
        avg_order_value: '33.4853',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.orderCount(VALID_STORE_ID);

      expect(result.revenue).toBe(100.46);
      expect(result.avgOrderValue).toBe(33.49);
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.orderCount(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
    });

    it('filters by completed/processing status', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.orderCount(VALID_STORE_ID);

      expect(builder.whereIn).toHaveBeenCalledWith('status', ['completed', 'processing']);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.orderCount('not-a-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for empty storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.orderCount('')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('connection refused'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.orderCount(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch order count',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder({
        order_count: '5',
        total_revenue: '500',
        avg_order_value: '100',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.orderCount(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID },
        'Order query: orderCount start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
        }),
        'Order query: orderCount completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      try {
        await queries.orderCount(VALID_STORE_ID);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db error',
        }),
        'Order query: orderCount failed',
      );
    });
  });

  // ── ordersByPeriod ──────────────────────────────────────────

  describe('ordersByPeriod', () => {
    it('returns correct results for today', async () => {
      const builder = createMockQueryBuilder({
        order_count: '10',
        total_revenue: '1500.00',
        avg_order_value: '150.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByPeriod(VALID_STORE_ID, 'today');

      expect(result).toEqual({
        orderCount: 10,
        revenue: 1500,
        avgOrderValue: 150,
      });
    });

    it('returns correct results for this_week', async () => {
      const builder = createMockQueryBuilder({
        order_count: '25',
        total_revenue: '3750.00',
        avg_order_value: '150.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByPeriod(VALID_STORE_ID, 'this_week');

      expect(result).toEqual({
        orderCount: 25,
        revenue: 3750,
        avgOrderValue: 150,
      });
    });

    it('returns correct results for this_month', async () => {
      const builder = createMockQueryBuilder({
        order_count: '100',
        total_revenue: '12500.00',
        avg_order_value: '125.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByPeriod(VALID_STORE_ID, 'this_month');

      expect(result).toEqual({
        orderCount: 100,
        revenue: 12500,
        avgOrderValue: 125,
      });
    });

    it('returns correct results for this_year', async () => {
      const builder = createMockQueryBuilder({
        order_count: '500',
        total_revenue: '62500.00',
        avg_order_value: '125.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByPeriod(VALID_STORE_ID, 'this_year');

      expect(result).toEqual({
        orderCount: 500,
        revenue: 62500,
        avgOrderValue: 125,
      });
    });

    it('returns correct results for last_7_days', async () => {
      const builder = createMockQueryBuilder({
        order_count: '15',
        total_revenue: '2250.00',
        avg_order_value: '150.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByPeriod(VALID_STORE_ID, 'last_7_days');

      expect(result).toEqual({
        orderCount: 15,
        revenue: 2250,
        avgOrderValue: 150,
      });
    });

    it('returns correct results for last_30_days', async () => {
      const builder = createMockQueryBuilder({
        order_count: '80',
        total_revenue: '10000.00',
        avg_order_value: '125.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByPeriod(VALID_STORE_ID, 'last_30_days');

      expect(result).toEqual({
        orderCount: 80,
        revenue: 10000,
        avgOrderValue: 125,
      });
    });

    it('returns zeros when no orders in period', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByPeriod(VALID_STORE_ID, 'today');

      expect(result).toEqual({
        orderCount: 0,
        revenue: 0,
        avgOrderValue: 0,
      });
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.ordersByPeriod(VALID_STORE_ID, 'today');

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
    });

    it('filters by completed/processing status', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.ordersByPeriod(VALID_STORE_ID, 'today');

      expect(builder.whereIn).toHaveBeenCalledWith('status', ['completed', 'processing']);
    });

    it('applies whereRaw for date filtering', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.ordersByPeriod(VALID_STORE_ID, 'today');

      expect(builder.whereRaw).toHaveBeenCalled();
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.ordersByPeriod('bad-uuid', 'today')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for invalid period', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.ordersByPeriod(VALID_STORE_ID, 'invalid_period' as never),
      ).rejects.toThrow('Invalid period: must be one of');
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('connection error'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.ordersByPeriod(VALID_STORE_ID, 'today')).rejects.toThrow(
        'Failed to fetch orders for period: today',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder({
        order_count: '3',
        total_revenue: '300',
        avg_order_value: '100',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.ordersByPeriod(VALID_STORE_ID, 'this_month');

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID, period: 'this_month' },
        'Order query: ordersByPeriod start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
        }),
        'Order query: ordersByPeriod completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      try {
        await queries.ordersByPeriod(VALID_STORE_ID, 'today');
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db error',
        }),
        'Order query: ordersByPeriod failed',
      );
    });
  });

  // ── ordersByDateRange ───────────────────────────────────────

  describe('ordersByDateRange', () => {
    it('returns correct results for date range', async () => {
      const builder = createMockQueryBuilder({
        order_count: '20',
        total_revenue: '2500.00',
        avg_order_value: '125.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByDateRange(
        VALID_STORE_ID,
        '2026-01-01',
        '2026-02-01',
      );

      expect(result).toEqual({
        orderCount: 20,
        revenue: 2500,
        avgOrderValue: 125,
      });
    });

    it('filters by store_id and date range (inclusive end)', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.ordersByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01');

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
      expect(builder.where).toHaveBeenCalledWith('date_created', '>=', '2026-01-01');
      // Date-only endDate is made inclusive by converting to end-of-day
      expect(builder.where).toHaveBeenCalledWith('date_created', '<=', '2026-02-01T23:59:59.999Z');
    });

    it('filters by completed/processing status', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.ordersByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01');

      expect(builder.whereIn).toHaveBeenCalledWith('status', ['completed', 'processing']);
    });

    it('returns zeros when no orders in range', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByDateRange(
        VALID_STORE_ID,
        '2026-01-01',
        '2026-02-01',
      );

      expect(result).toEqual({
        orderCount: 0,
        revenue: 0,
        avgOrderValue: 0,
      });
    });

    it('handles undefined row gracefully', async () => {
      const builder = createMockQueryBuilder([]);
      builder.first.mockResolvedValue(undefined);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByDateRange(
        VALID_STORE_ID,
        '2026-01-01',
        '2026-02-01',
      );

      expect(result).toEqual({
        orderCount: 0,
        revenue: 0,
        avgOrderValue: 0,
      });
    });

    it('accepts ISO 8601 datetime format', async () => {
      const builder = createMockQueryBuilder({
        order_count: '7',
        total_revenue: '700.00',
        avg_order_value: '100.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.ordersByDateRange(
        VALID_STORE_ID,
        '2026-01-01T00:00:00Z',
        '2026-02-01T00:00:00Z',
      );

      expect(result).toEqual({
        orderCount: 7,
        revenue: 700,
        avgOrderValue: 100,
      });
    });

    it('throws ValidationError for invalid startDate', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.ordersByDateRange(VALID_STORE_ID, 'not-a-date', '2026-02-01'),
      ).rejects.toThrow('Invalid startDate');
    });

    it('throws ValidationError for invalid endDate', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.ordersByDateRange(VALID_STORE_ID, '2026-01-01', 'bad'),
      ).rejects.toThrow('Invalid endDate');
    });

    it('throws ValidationError when startDate is after endDate', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.ordersByDateRange(VALID_STORE_ID, '2026-03-01', '2026-01-01'),
      ).rejects.toThrow('startDate must be before or equal to endDate');
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder({});
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.ordersByDateRange('bad', '2026-01-01', '2026-02-01'),
      ).rejects.toThrow('Invalid storeId: must be a valid UUID');
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('connection error'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.ordersByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01'),
      ).rejects.toThrow('Failed to fetch orders for date range');
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder({
        order_count: '0',
        total_revenue: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.ordersByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01');

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID, startDate: '2026-01-01', endDate: '2026-02-01' },
        'Order query: ordersByDateRange start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
        }),
        'Order query: ordersByDateRange completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder({});
      builder.first.mockRejectedValue(new Error('db timeout'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      try {
        await queries.ordersByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01');
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db timeout',
        }),
        'Order query: ordersByDateRange failed',
      );
    });
  });

  // ── orderStatusBreakdown ────────────────────────────────────

  describe('orderStatusBreakdown', () => {
    it('returns all statuses with counts', async () => {
      const builder = createMockQueryBuilder([
        { status: 'completed', order_count: '50' },
        { status: 'processing', order_count: '10' },
        { status: 'pending', order_count: '5' },
        { status: 'refunded', order_count: '2' },
      ]);
      // orderStatusBreakdown ends at orderBy which returns builder, then resolved via the chain
      builder.orderBy.mockResolvedValue([
        { status: 'completed', order_count: '50' },
        { status: 'processing', order_count: '10' },
        { status: 'pending', order_count: '5' },
        { status: 'refunded', order_count: '2' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.orderStatusBreakdown(VALID_STORE_ID);

      expect(result).toEqual([
        { status: 'completed', count: 50 },
        { status: 'processing', count: 10 },
        { status: 'pending', count: 5 },
        { status: 'refunded', count: 2 },
      ]);
    });

    it('returns empty array when no orders exist', async () => {
      const builder = createMockQueryBuilder([]);
      builder.orderBy.mockResolvedValue([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.orderStatusBreakdown(VALID_STORE_ID);

      expect(result).toEqual([]);
    });

    it('handles single status', async () => {
      const builder = createMockQueryBuilder([]);
      builder.orderBy.mockResolvedValue([
        { status: 'completed', order_count: '100' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.orderStatusBreakdown(VALID_STORE_ID);

      expect(result).toEqual([
        { status: 'completed', count: 100 },
      ]);
    });

    it('handles null status as unknown', async () => {
      const builder = createMockQueryBuilder([]);
      builder.orderBy.mockResolvedValue([
        { status: null, order_count: '3' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.orderStatusBreakdown(VALID_STORE_ID);

      expect(result[0].status).toBe('unknown');
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder([]);
      builder.orderBy.mockResolvedValue([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.orderStatusBreakdown(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
    });

    it('does NOT filter by status (includes all statuses)', async () => {
      const builder = createMockQueryBuilder([]);
      builder.orderBy.mockResolvedValue([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.orderStatusBreakdown(VALID_STORE_ID);

      expect(builder.whereIn).not.toHaveBeenCalled();
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.orderStatusBreakdown('not-a-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.orderBy.mockRejectedValue(new Error('connection refused'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.orderStatusBreakdown(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch order status breakdown',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder([]);
      builder.orderBy.mockResolvedValue([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.orderStatusBreakdown(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID },
        'Order query: orderStatusBreakdown start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
          resultCount: 0,
        }),
        'Order query: orderStatusBreakdown completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder([]);
      builder.orderBy.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      try {
        await queries.orderStatusBreakdown(VALID_STORE_ID);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db error',
        }),
        'Order query: orderStatusBreakdown failed',
      );
    });
  });

  // ── recentOrders ────────────────────────────────────────────

  describe('recentOrders', () => {
    it('returns orders sorted by date_created descending', async () => {
      const builder = createMockQueryBuilder([
        {
          wc_order_id: '1001',
          date_created: new Date('2026-02-11T10:00:00Z'),
          status: 'completed',
          total: '150.00',
        },
        {
          wc_order_id: '1000',
          date_created: new Date('2026-02-10T08:00:00Z'),
          status: 'processing',
          total: '75.50',
        },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.recentOrders(VALID_STORE_ID);

      expect(result).toEqual([
        {
          wcOrderId: 1001,
          dateCreated: '2026-02-11T10:00:00.000Z',
          status: 'completed',
          total: 150,
        },
        {
          wcOrderId: 1000,
          dateCreated: '2026-02-10T08:00:00.000Z',
          status: 'processing',
          total: 75.5,
        },
      ]);
    });

    it('defaults to limit 10', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.recentOrders(VALID_STORE_ID);

      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it('respects custom limit', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.recentOrders(VALID_STORE_ID, 5);

      expect(builder.limit).toHaveBeenCalledWith(5);
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.recentOrders(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
    });

    it('does NOT filter by status (shows all orders)', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.recentOrders(VALID_STORE_ID);

      expect(builder.whereIn).not.toHaveBeenCalled();
    });

    it('returns empty array when no orders exist', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.recentOrders(VALID_STORE_ID);

      expect(result).toEqual([]);
    });

    it('handles string date_created (non-Date object)', async () => {
      const builder = createMockQueryBuilder([
        {
          wc_order_id: '1002',
          date_created: '2026-02-11T12:00:00.000Z',
          status: 'completed',
          total: '200.00',
        },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.recentOrders(VALID_STORE_ID);

      expect(result[0].dateCreated).toBe('2026-02-11T12:00:00.000Z');
    });

    it('handles null values gracefully', async () => {
      const builder = createMockQueryBuilder([
        {
          wc_order_id: null,
          date_created: null,
          status: null,
          total: null,
        },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      const result = await queries.recentOrders(VALID_STORE_ID);

      expect(result[0]).toEqual({
        wcOrderId: 0,
        dateCreated: '',
        status: 'unknown',
        total: 0,
      });
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.recentOrders('not-a-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for limit < 1', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.recentOrders(VALID_STORE_ID, 0)).rejects.toThrow(
        'limit must be an integer between 1 and 100',
      );
    });

    it('throws ValidationError for limit > 100', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.recentOrders(VALID_STORE_ID, 101)).rejects.toThrow(
        'limit must be an integer between 1 and 100',
      );
    });

    it('throws ValidationError for non-integer limit', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.recentOrders(VALID_STORE_ID, 3.5)).rejects.toThrow(
        'limit must be an integer between 1 and 100',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('connection refused'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await expect(queries.recentOrders(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch recent orders',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder([
        { wc_order_id: '1', date_created: '2026-01-01', status: 'completed', total: '100' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      await queries.recentOrders(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID, limit: 10 },
        'Order query: recentOrders start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
          resultCount: 1,
        }),
        'Order query: recentOrders completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createOrderQueries({ readonlyDb: mockDb as never });

      try {
        await queries.recentOrders(VALID_STORE_ID);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db error',
        }),
        'Order query: recentOrders failed',
      );
    });
  });
});
