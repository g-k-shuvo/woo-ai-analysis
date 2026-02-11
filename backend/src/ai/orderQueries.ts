/**
 * Order Query Service — pre-built, parameterized SQL queries for common order metrics.
 *
 * Provides fast, reliable order data without the AI pipeline overhead.
 * All queries:
 * - Include WHERE store_id = ? for tenant isolation
 * - Use parameterized placeholders (no string concatenation)
 * - Round monetary values to 2 decimal places
 * - Run on the read-only database connection
 * - Never expose raw PII (emails, addresses)
 */

import type { Knex } from 'knex';
import { AppError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

const ORDER_STATUSES = ['completed', 'processing'] as const;

const DEFAULT_RECENT_ORDERS_LIMIT = 10;
const MAX_RECENT_ORDERS_LIMIT = 100;

const VALID_PERIODS = new Set<string>([
  'today', 'this_week', 'this_month', 'this_year', 'last_7_days', 'last_30_days',
]);

export type OrderPeriod =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'last_7_days'
  | 'last_30_days';

export interface OrderCountResult {
  orderCount: number;
  revenue: number;
  avgOrderValue: number;
}

export interface OrderStatusBreakdownRow {
  status: string;
  count: number;
}

export interface RecentOrderRow {
  wcOrderId: number;
  dateCreated: string;
  status: string;
  total: number;
}

export interface OrderQueryDeps {
  readonlyDb: Knex;
}

function validateStoreId(storeId: string): void {
  if (!storeId || !UUID_RE.test(storeId)) {
    throw new ValidationError('Invalid storeId: must be a valid UUID');
  }
}

function validatePeriod(period: string): asserts period is OrderPeriod {
  if (!VALID_PERIODS.has(period)) {
    throw new ValidationError(
      `Invalid period: must be one of ${[...VALID_PERIODS].join(', ')}`,
    );
  }
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECENT_ORDERS_LIMIT) {
    throw new ValidationError(`limit must be an integer between 1 and ${MAX_RECENT_ORDERS_LIMIT}`);
  }
}

function getPeriodStart(period: OrderPeriod): string {
  switch (period) {
    case 'today':
      return "(DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')";
    case 'this_week':
      return "(DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')";
    case 'this_month':
      return "(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')";
    case 'this_year':
      return "(DATE_TRUNC('year', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')";
    case 'last_7_days':
      return "NOW() - INTERVAL '7 days'";
    case 'last_30_days':
      return "NOW() - INTERVAL '30 days'";
    default: {
      const _exhaustive: never = period;
      throw new ValidationError(`Unsupported period: ${String(_exhaustive)}`);
    }
  }
}

function parseOrderCountRow(row: Record<string, unknown> | undefined): OrderCountResult {
  const orderCount = parseInt(String(row?.order_count ?? '0'), 10) || 0;
  const revenue = parseFloat(String(row?.total_revenue ?? '0')) || 0;
  const avgOrderValue = parseFloat(String(row?.avg_order_value ?? '0')) || 0;
  return {
    orderCount,
    revenue: Math.round(revenue * 100) / 100,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
  };
}

async function measureQuery<T>(
  logContext: Record<string, unknown>,
  queryName: string,
  errorMessage: string,
  queryFn: () => Promise<T>,
): Promise<T> {
  const startTime = Date.now();
  logger.info(logContext, `Order query: ${queryName} start`);
  try {
    const result = await queryFn();
    const durationMs = Date.now() - startTime;
    const resultCount = Array.isArray(result) ? result.length : undefined;
    logger.info(
      { ...logContext, durationMs, resultCount },
      `Order query: ${queryName} completed`,
    );
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const durationMs = Date.now() - startTime;
    logger.error(
      { ...logContext, durationMs, error: (err as Error).message },
      `Order query: ${queryName} failed`,
    );
    throw new AppError(errorMessage, {
      cause: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

export function createOrderQueries(deps: OrderQueryDeps) {
  const { readonlyDb } = deps;

  async function orderCount(storeId: string): Promise<OrderCountResult> {
    validateStoreId(storeId);

    return measureQuery({ storeId }, 'orderCount', 'Failed to fetch order count', async () => {
      const row = await readonlyDb('orders')
        .where({ store_id: storeId })
        .whereIn('status', ORDER_STATUSES)
        .select(
          readonlyDb.raw('COUNT(*) AS order_count'),
          readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
          readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
        )
        .first<Record<string, unknown>>();

      return parseOrderCountRow(row);
    });
  }

  async function ordersByPeriod(
    storeId: string,
    period: OrderPeriod,
  ): Promise<OrderCountResult> {
    validateStoreId(storeId);
    validatePeriod(period);

    const periodStart = getPeriodStart(period);

    return measureQuery({ storeId, period }, 'ordersByPeriod', `Failed to fetch orders for period: ${period}`, async () => {
      const row = await readonlyDb('orders')
        .where({ store_id: storeId })
        .whereIn('status', ORDER_STATUSES)
        .whereRaw(`date_created >= ${periodStart}`)
        .select(
          readonlyDb.raw('COUNT(*) AS order_count'),
          readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
          readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
        )
        .first<Record<string, unknown>>();

      return parseOrderCountRow(row);
    });
  }

  async function ordersByDateRange(
    storeId: string,
    startDate: string,
    endDate: string,
  ): Promise<OrderCountResult> {
    validateStoreId(storeId);

    if (!startDate || !ISO_DATE_RE.test(startDate)) {
      throw new ValidationError('Invalid startDate: must be ISO 8601 format (YYYY-MM-DD)');
    }
    if (!endDate || !ISO_DATE_RE.test(endDate)) {
      throw new ValidationError('Invalid endDate: must be ISO 8601 format (YYYY-MM-DD)');
    }
    if (startDate > endDate) {
      throw new ValidationError('startDate must be before or equal to endDate');
    }

    // Make endDate inclusive: for date-only strings, treat as end of day
    const inclusiveEndDate = endDate.length === 10 ? `${endDate}T23:59:59.999Z` : endDate;

    return measureQuery(
      { storeId, startDate, endDate },
      'ordersByDateRange',
      'Failed to fetch orders for date range',
      async () => {
        const row = await readonlyDb('orders')
          .where({ store_id: storeId })
          .whereIn('status', ORDER_STATUSES)
          .where('date_created', '>=', startDate)
          .where('date_created', '<=', inclusiveEndDate)
          .select(
            readonlyDb.raw('COUNT(*) AS order_count'),
            readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
            readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
          )
          .first<Record<string, unknown>>();

        return parseOrderCountRow(row);
      },
    );
  }

  async function orderStatusBreakdown(storeId: string): Promise<OrderStatusBreakdownRow[]> {
    validateStoreId(storeId);

    return measureQuery({ storeId }, 'orderStatusBreakdown', 'Failed to fetch order status breakdown', async () => {
      const rows = (await readonlyDb('orders')
        .where({ store_id: storeId })
        .select('status')
        .count('* as order_count')
        .groupBy('status')
        .orderBy('order_count', 'desc')) as { status: string | null; order_count: string }[];

      return rows.map((row) => ({
        status: row.status ?? 'unknown',
        count: parseInt(row.order_count, 10) || 0,
      }));
    });
  }

  async function recentOrders(
    storeId: string,
    limit: number = DEFAULT_RECENT_ORDERS_LIMIT,
  ): Promise<RecentOrderRow[]> {
    validateStoreId(storeId);
    validateLimit(limit);

    return measureQuery({ storeId, limit }, 'recentOrders', 'Failed to fetch recent orders', async () => {
      const rows = (await readonlyDb('orders')
        .where({ store_id: storeId })
        .select(
          'wc_order_id',
          'date_created',
          'status',
          readonlyDb.raw('ROUND(total, 2) AS total'),
        )
        .orderBy('date_created', 'desc')
        .limit(limit)) as {
        wc_order_id: string | number | null;
        date_created: Date | string | null;
        status: string | null;
        total: string | number | null;
      }[];

      return rows.map((row) => ({
        wcOrderId: parseInt(String(row.wc_order_id ?? '0'), 10) || 0,
        dateCreated: row.date_created instanceof Date
          ? row.date_created.toISOString()
          : String(row.date_created ?? ''),
        status: row.status ?? 'unknown',
        total: parseFloat(String(row.total ?? '0')) || 0,
      }));
    });
  }

  return {
    orderCount,
    ordersByPeriod,
    ordersByDateRange,
    orderStatusBreakdown,
    recentOrders,
  };
}

export type OrderQueries = ReturnType<typeof createOrderQueries>;
