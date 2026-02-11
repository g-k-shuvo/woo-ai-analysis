import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createRevenueQueries } = await import('../../../src/ai/revenueQueries.js');
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
  groupByRaw: AnyMock;
  orderByRaw: AnyMock;
  limit: AnyMock;
}

function createMockQueryBuilder(
  firstResult: Record<string, unknown> | undefined = undefined,
  allResults: Array<Record<string, unknown>> | undefined = undefined,
): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    where: jest.fn(),
    whereIn: jest.fn(),
    whereRaw: jest.fn(),
    select: jest.fn(),
    first: jest.fn(),
    groupByRaw: jest.fn(),
    orderByRaw: jest.fn(),
    limit: jest.fn(),
  };

  // Chain all methods back to builder
  builder.where.mockReturnValue(builder);
  builder.whereIn.mockReturnValue(builder);
  builder.whereRaw.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.groupByRaw.mockReturnValue(builder);
  builder.orderByRaw.mockReturnValue(builder);

  if (allResults !== undefined) {
    // For breakdown queries that return arrays
    builder.limit.mockResolvedValue(allResults);
  } else {
    // For aggregate queries that use .first()
    builder.first.mockResolvedValue(firstResult);
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

describe('createRevenueQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── totalRevenue ────────────────────────────────────────────

  describe('totalRevenue', () => {
    it('returns revenue, orderCount, and avgOrderValue', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '1234.56',
        order_count: '42',
        avg_order_value: '29.39',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.totalRevenue(VALID_STORE_ID);

      expect(result).toEqual({
        revenue: 1234.56,
        orderCount: 42,
        avgOrderValue: 29.39,
      });
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '0',
        order_count: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await queries.totalRevenue(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
    });

    it('filters by revenue statuses (completed, processing)', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '0',
        order_count: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await queries.totalRevenue(VALID_STORE_ID);

      expect(builder.whereIn).toHaveBeenCalledWith('status', ['completed', 'processing']);
    });

    it('returns zeros when no orders exist', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '0',
        order_count: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.totalRevenue(VALID_STORE_ID);

      expect(result).toEqual({ revenue: 0, orderCount: 0, avgOrderValue: 0 });
    });

    it('handles undefined row gracefully', async () => {
      const builder = createMockQueryBuilder(undefined);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.totalRevenue(VALID_STORE_ID);

      expect(result).toEqual({ revenue: 0, orderCount: 0, avgOrderValue: 0 });
    });

    it('rounds monetary values to 2 decimal places', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '1234.567',
        order_count: '3',
        avg_order_value: '411.5223',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.totalRevenue(VALID_STORE_ID);

      expect(result.revenue).toBe(1234.57);
      expect(result.avgOrderValue).toBe(411.52);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder();
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(queries.totalRevenue('not-a-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for empty storeId', async () => {
      const builder = createMockQueryBuilder();
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(queries.totalRevenue('')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder();
      builder.first.mockRejectedValue(new Error('connection refused'));
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(queries.totalRevenue(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch total revenue',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '100',
        order_count: '2',
        avg_order_value: '50',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await queries.totalRevenue(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID },
        'Revenue query: totalRevenue start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
          revenue: 100,
          orderCount: 2,
        }),
        'Revenue query: totalRevenue completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder();
      builder.first.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      try {
        await queries.totalRevenue(VALID_STORE_ID);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db error',
        }),
        'Revenue query: totalRevenue failed',
      );
    });
  });

  // ── revenueByPeriod ─────────────────────────────────────────

  describe('revenueByPeriod', () => {
    const periods = [
      'today',
      'this_week',
      'this_month',
      'this_year',
      'last_7_days',
      'last_30_days',
    ] as const;

    for (const period of periods) {
      it(`returns revenue for period: ${period}`, async () => {
        const builder = createMockQueryBuilder({
          total_revenue: '500.00',
          order_count: '10',
          avg_order_value: '50.00',
        });
        const mockDb = createMockDb(builder);
        const queries = createRevenueQueries({ readonlyDb: mockDb as never });

        const result = await queries.revenueByPeriod(VALID_STORE_ID, period);

        expect(result).toEqual({
          revenue: 500,
          orderCount: 10,
          avgOrderValue: 50,
        });
      });
    }

    it('applies date boundaries via whereRaw', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '0',
        order_count: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await queries.revenueByPeriod(VALID_STORE_ID, 'this_month');

      // Should have two whereRaw calls for date boundaries
      expect(builder.whereRaw).toHaveBeenCalledTimes(2);
      const rawCalls = builder.whereRaw.mock.calls as unknown[][];
      expect(String(rawCalls[0][0])).toContain("DATE_TRUNC('month', NOW())");
      expect(String(rawCalls[1][0])).toContain('NOW()');
    });

    it('filters by store_id and revenue statuses', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '0',
        order_count: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await queries.revenueByPeriod(VALID_STORE_ID, 'today');

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
      expect(builder.whereIn).toHaveBeenCalledWith('status', ['completed', 'processing']);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder();
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(queries.revenueByPeriod('bad', 'today')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder();
      builder.first.mockRejectedValue(new Error('timeout'));
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueByPeriod(VALID_STORE_ID, 'this_month'),
      ).rejects.toThrow('Failed to fetch revenue for period: this_month');
    });
  });

  // ── revenueByDateRange ──────────────────────────────────────

  describe('revenueByDateRange', () => {
    it('returns revenue for a custom date range', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '2500.00',
        order_count: '20',
        avg_order_value: '125.00',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueByDateRange(
        VALID_STORE_ID,
        '2026-01-01',
        '2026-02-01',
      );

      expect(result).toEqual({
        revenue: 2500,
        orderCount: 20,
        avgOrderValue: 125,
      });
    });

    it('filters by store_id and date range', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '0',
        order_count: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await queries.revenueByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01');

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
      expect(builder.where).toHaveBeenCalledWith('date_created', '>=', '2026-01-01');
      expect(builder.where).toHaveBeenCalledWith('date_created', '<', '2026-02-01');
    });

    it('throws ValidationError for invalid startDate', async () => {
      const builder = createMockQueryBuilder();
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueByDateRange(VALID_STORE_ID, 'not-a-date', '2026-02-01'),
      ).rejects.toThrow('Invalid startDate');
    });

    it('throws ValidationError for invalid endDate', async () => {
      const builder = createMockQueryBuilder();
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueByDateRange(VALID_STORE_ID, '2026-01-01', 'bad'),
      ).rejects.toThrow('Invalid endDate');
    });

    it('throws ValidationError when startDate is after endDate', async () => {
      const builder = createMockQueryBuilder();
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueByDateRange(VALID_STORE_ID, '2026-03-01', '2026-01-01'),
      ).rejects.toThrow('startDate must be before or equal to endDate');
    });

    it('accepts ISO 8601 datetime format', async () => {
      const builder = createMockQueryBuilder({
        total_revenue: '100',
        order_count: '1',
        avg_order_value: '100',
      });
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueByDateRange(
        VALID_STORE_ID,
        '2026-01-01T00:00:00Z',
        '2026-02-01T00:00:00Z',
      );

      expect(result.revenue).toBe(100);
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder();
      builder.first.mockRejectedValue(new Error('connection error'));
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueByDateRange(VALID_STORE_ID, '2026-01-01', '2026-02-01'),
      ).rejects.toThrow('Failed to fetch revenue for date range');
    });
  });

  // ── revenueComparison ───────────────────────────────────────

  describe('revenueComparison', () => {
    it('returns current and previous period with growth metrics', async () => {
      const currentBuilder = createMockQueryBuilder({
        total_revenue: '1000.00',
        order_count: '20',
        avg_order_value: '50.00',
      });
      const previousBuilder = createMockQueryBuilder({
        total_revenue: '800.00',
        order_count: '16',
        avg_order_value: '50.00',
      });
      const mockDb = createMockDb([currentBuilder, previousBuilder]);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueComparison(VALID_STORE_ID, 'this_month');

      expect(result.current).toEqual({
        revenue: 1000,
        orderCount: 20,
        avgOrderValue: 50,
      });
      expect(result.previous).toEqual({
        revenue: 800,
        orderCount: 16,
        avgOrderValue: 50,
      });
      expect(result.revenueChange).toBe(200);
      expect(result.revenueChangePercent).toBe(25);
      expect(result.trend).toBe('up');
    });

    it('returns trend "down" when revenue decreased', async () => {
      const currentBuilder = createMockQueryBuilder({
        total_revenue: '500.00',
        order_count: '10',
        avg_order_value: '50.00',
      });
      const previousBuilder = createMockQueryBuilder({
        total_revenue: '1000.00',
        order_count: '20',
        avg_order_value: '50.00',
      });
      const mockDb = createMockDb([currentBuilder, previousBuilder]);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueComparison(VALID_STORE_ID, 'this_month');

      expect(result.revenueChange).toBe(-500);
      expect(result.revenueChangePercent).toBe(-50);
      expect(result.trend).toBe('down');
    });

    it('returns trend "flat" when revenue is unchanged', async () => {
      const currentBuilder = createMockQueryBuilder({
        total_revenue: '500.00',
        order_count: '10',
        avg_order_value: '50.00',
      });
      const previousBuilder = createMockQueryBuilder({
        total_revenue: '500.00',
        order_count: '10',
        avg_order_value: '50.00',
      });
      const mockDb = createMockDb([currentBuilder, previousBuilder]);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueComparison(VALID_STORE_ID, 'this_month');

      expect(result.revenueChange).toBe(0);
      expect(result.revenueChangePercent).toBe(0);
      expect(result.trend).toBe('flat');
    });

    it('handles zero previous revenue (avoids division by zero)', async () => {
      const currentBuilder = createMockQueryBuilder({
        total_revenue: '500.00',
        order_count: '10',
        avg_order_value: '50.00',
      });
      const previousBuilder = createMockQueryBuilder({
        total_revenue: '0',
        order_count: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb([currentBuilder, previousBuilder]);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueComparison(VALID_STORE_ID, 'this_month');

      expect(result.revenueChange).toBe(500);
      expect(result.revenueChangePercent).toBe(100);
      expect(result.trend).toBe('up');
    });

    it('handles both periods having zero revenue', async () => {
      const currentBuilder = createMockQueryBuilder({
        total_revenue: '0',
        order_count: '0',
        avg_order_value: '0',
      });
      const previousBuilder = createMockQueryBuilder({
        total_revenue: '0',
        order_count: '0',
        avg_order_value: '0',
      });
      const mockDb = createMockDb([currentBuilder, previousBuilder]);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueComparison(VALID_STORE_ID, 'this_month');

      expect(result.revenueChange).toBe(0);
      expect(result.revenueChangePercent).toBe(0);
      expect(result.trend).toBe('flat');
    });

    it('runs current and previous queries in parallel', async () => {
      const currentBuilder = createMockQueryBuilder({
        total_revenue: '100',
        order_count: '2',
        avg_order_value: '50',
      });
      const previousBuilder = createMockQueryBuilder({
        total_revenue: '80',
        order_count: '2',
        avg_order_value: '40',
      });
      const mockDb = createMockDb([currentBuilder, previousBuilder]);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await queries.revenueComparison(VALID_STORE_ID, 'today');

      // Both builders should have been used (mockDb called twice)
      expect(mockDb).toHaveBeenCalledTimes(2);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder();
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueComparison('invalid', 'this_month'),
      ).rejects.toThrow('Invalid storeId: must be a valid UUID');
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder();
      builder.first.mockRejectedValue(new Error('db down'));
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueComparison(VALID_STORE_ID, 'this_month'),
      ).rejects.toThrow('Failed to fetch revenue comparison');
    });
  });

  // ── revenueBreakdown ────────────────────────────────────────

  describe('revenueBreakdown', () => {
    it('returns daily breakdown rows with totals', async () => {
      const rows = [
        {
          period: new Date('2026-02-09T00:00:00Z'),
          total_revenue: '200.00',
          order_count: '4',
        },
        {
          period: new Date('2026-02-10T00:00:00Z'),
          total_revenue: '350.00',
          order_count: '7',
        },
        {
          period: new Date('2026-02-11T00:00:00Z'),
          total_revenue: '150.00',
          order_count: '3',
        },
      ];
      const builder = createMockQueryBuilder(undefined, rows);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueBreakdown(VALID_STORE_ID, 'day', 7);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toEqual({
        period: '2026-02-09T00:00:00.000Z',
        revenue: 200,
        orderCount: 4,
      });
      expect(result.rows[1]).toEqual({
        period: '2026-02-10T00:00:00.000Z',
        revenue: 350,
        orderCount: 7,
      });
      expect(result.total).toBe(700);
    });

    it('returns weekly breakdown', async () => {
      const rows = [
        { period: '2026-02-03', total_revenue: '1000.00', order_count: '20' },
        { period: '2026-02-10', total_revenue: '1200.00', order_count: '25' },
      ];
      const builder = createMockQueryBuilder(undefined, rows);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueBreakdown(VALID_STORE_ID, 'week', 4);

      expect(result.rows).toHaveLength(2);
      expect(result.total).toBe(2200);
    });

    it('returns monthly breakdown', async () => {
      const rows = [
        { period: '2025-12-01', total_revenue: '5000.00', order_count: '100' },
        { period: '2026-01-01', total_revenue: '5500.00', order_count: '110' },
        { period: '2026-02-01', total_revenue: '4800.00', order_count: '95' },
      ];
      const builder = createMockQueryBuilder(undefined, rows);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueBreakdown(VALID_STORE_ID, 'month', 6);

      expect(result.rows).toHaveLength(3);
      expect(result.total).toBe(15300);
    });

    it('returns empty rows for no data', async () => {
      const builder = createMockQueryBuilder(undefined, []);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      const result = await queries.revenueBreakdown(VALID_STORE_ID, 'day', 7);

      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('applies LIMIT based on periods parameter', async () => {
      const builder = createMockQueryBuilder(undefined, []);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await queries.revenueBreakdown(VALID_STORE_ID, 'day', 14);

      expect(builder.limit).toHaveBeenCalledWith(14);
    });

    it('filters by store_id and revenue statuses', async () => {
      const builder = createMockQueryBuilder(undefined, []);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await queries.revenueBreakdown(VALID_STORE_ID, 'day', 7);

      expect(builder.where).toHaveBeenCalledWith({ store_id: VALID_STORE_ID });
      expect(builder.whereIn).toHaveBeenCalledWith('status', ['completed', 'processing']);
    });

    it('throws ValidationError for periods < 1', async () => {
      const builder = createMockQueryBuilder(undefined, []);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueBreakdown(VALID_STORE_ID, 'day', 0),
      ).rejects.toThrow('periods must be an integer between 1 and 365');
    });

    it('throws ValidationError for periods > 365', async () => {
      const builder = createMockQueryBuilder(undefined, []);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueBreakdown(VALID_STORE_ID, 'day', 400),
      ).rejects.toThrow('periods must be an integer between 1 and 365');
    });

    it('throws ValidationError for non-integer periods', async () => {
      const builder = createMockQueryBuilder(undefined, []);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueBreakdown(VALID_STORE_ID, 'day', 3.5),
      ).rejects.toThrow('periods must be an integer between 1 and 365');
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder(undefined, []);
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueBreakdown('bad-id', 'day', 7),
      ).rejects.toThrow('Invalid storeId: must be a valid UUID');
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder(undefined, []);
      builder.limit.mockRejectedValue(new Error('query timeout'));
      const mockDb = createMockDb(builder);
      const queries = createRevenueQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.revenueBreakdown(VALID_STORE_ID, 'day', 7),
      ).rejects.toThrow('Failed to fetch revenue breakdown by day');
    });

    it('uses correct interval units for day/week/month', async () => {
      for (const interval of ['day', 'week', 'month'] as const) {
        const builder = createMockQueryBuilder(undefined, []);
        const mockDb = createMockDb(builder);
        const queries = createRevenueQueries({ readonlyDb: mockDb as never });

        await queries.revenueBreakdown(VALID_STORE_ID, interval, 7);

        // Verify DATE_TRUNC uses the correct unit
        const groupByCall = (builder.groupByRaw.mock.calls as unknown[][])[0][0] as string;
        expect(groupByCall).toContain(`'${interval}'`);
      }
    });
  });
});
