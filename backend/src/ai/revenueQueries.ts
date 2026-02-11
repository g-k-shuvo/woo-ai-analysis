/**
 * Revenue Query Service — pre-built, parameterized SQL queries for common revenue metrics.
 *
 * Provides fast, reliable revenue data without the AI pipeline overhead.
 * All queries:
 * - Include WHERE store_id = ? for tenant isolation
 * - Filter by status IN ('completed', 'processing')
 * - Use parameterized placeholders (no string concatenation)
 * - Round monetary values to 2 decimal places
 * - Run on the read-only database connection
 */

import type { Knex } from 'knex';
import { AppError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

const REVENUE_STATUSES = ['completed', 'processing'];

export type RevenuePeriod =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'last_7_days'
  | 'last_30_days';

export type BreakdownInterval = 'day' | 'week' | 'month';

export interface RevenueResult {
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
}

export interface RevenueComparisonResult {
  current: RevenueResult;
  previous: RevenueResult;
  revenueChange: number;
  revenueChangePercent: number;
  trend: 'up' | 'down' | 'flat';
}

export interface RevenueBreakdownRow {
  period: string;
  revenue: number;
  orderCount: number;
}

export interface RevenueBreakdownResult {
  rows: RevenueBreakdownRow[];
  total: number;
}

export interface RevenueQueryDeps {
  readonlyDb: Knex;
}

function validateStoreId(storeId: string): void {
  if (!storeId || !UUID_RE.test(storeId)) {
    throw new ValidationError('Invalid storeId: must be a valid UUID');
  }
}

/**
 * Returns the PostgreSQL date_trunc unit and interval offset for a given period.
 */
function getPeriodBoundaries(period: RevenuePeriod): {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
} {
  switch (period) {
    case 'today':
      return {
        currentStart: "DATE_TRUNC('day', NOW())",
        currentEnd: 'NOW()',
        previousStart: "DATE_TRUNC('day', NOW()) - INTERVAL '1 day'",
        previousEnd: "DATE_TRUNC('day', NOW())",
      };
    case 'this_week':
      return {
        currentStart: "DATE_TRUNC('week', NOW())",
        currentEnd: 'NOW()',
        previousStart: "DATE_TRUNC('week', NOW()) - INTERVAL '1 week'",
        previousEnd: "DATE_TRUNC('week', NOW())",
      };
    case 'this_month':
      return {
        currentStart: "DATE_TRUNC('month', NOW())",
        currentEnd: 'NOW()',
        previousStart: "DATE_TRUNC('month', NOW()) - INTERVAL '1 month'",
        previousEnd: "DATE_TRUNC('month', NOW())",
      };
    case 'this_year':
      return {
        currentStart: "DATE_TRUNC('year', NOW())",
        currentEnd: 'NOW()',
        previousStart: "DATE_TRUNC('year', NOW()) - INTERVAL '1 year'",
        previousEnd: "DATE_TRUNC('year', NOW())",
      };
    case 'last_7_days':
      return {
        currentStart: "NOW() - INTERVAL '7 days'",
        currentEnd: 'NOW()',
        previousStart: "NOW() - INTERVAL '14 days'",
        previousEnd: "NOW() - INTERVAL '7 days'",
      };
    case 'last_30_days':
      return {
        currentStart: "NOW() - INTERVAL '30 days'",
        currentEnd: 'NOW()',
        previousStart: "NOW() - INTERVAL '60 days'",
        previousEnd: "NOW() - INTERVAL '30 days'",
      };
  }
}

function parseRevenueRow(row: Record<string, unknown> | undefined): RevenueResult {
  const revenue = parseFloat(String(row?.total_revenue ?? '0')) || 0;
  const orderCount = parseInt(String(row?.order_count ?? '0'), 10) || 0;
  const avgOrderValue = parseFloat(String(row?.avg_order_value ?? '0')) || 0;
  return {
    revenue: Math.round(revenue * 100) / 100,
    orderCount,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
  };
}

export function createRevenueQueries(deps: RevenueQueryDeps) {
  const { readonlyDb } = deps;

  async function totalRevenue(storeId: string): Promise<RevenueResult> {
    validateStoreId(storeId);

    const startTime = Date.now();
    logger.info({ storeId }, 'Revenue query: totalRevenue start');

    try {
      const row = await readonlyDb('orders')
        .where({ store_id: storeId })
        .whereIn('status', REVENUE_STATUSES)
        .select(
          readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
          readonlyDb.raw('COUNT(*) AS order_count'),
          readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
        )
        .first<Record<string, unknown>>();

      const result = parseRevenueRow(row);
      const durationMs = Date.now() - startTime;

      logger.info({ storeId, durationMs, ...result }, 'Revenue query: totalRevenue completed');
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, durationMs, error: (err as Error).message },
        'Revenue query: totalRevenue failed',
      );
      throw new AppError('Failed to fetch total revenue', {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function revenueByPeriod(
    storeId: string,
    period: RevenuePeriod,
  ): Promise<RevenueResult> {
    validateStoreId(storeId);

    const bounds = getPeriodBoundaries(period);
    const startTime = Date.now();
    logger.info({ storeId, period }, 'Revenue query: revenueByPeriod start');

    try {
      const row = await readonlyDb('orders')
        .where({ store_id: storeId })
        .whereIn('status', REVENUE_STATUSES)
        .whereRaw(`date_created >= ${bounds.currentStart}`)
        .whereRaw(`date_created < ${bounds.currentEnd}`)
        .select(
          readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
          readonlyDb.raw('COUNT(*) AS order_count'),
          readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
        )
        .first<Record<string, unknown>>();

      const result = parseRevenueRow(row);
      const durationMs = Date.now() - startTime;

      logger.info({ storeId, period, durationMs, ...result }, 'Revenue query: revenueByPeriod completed');
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, period, durationMs, error: (err as Error).message },
        'Revenue query: revenueByPeriod failed',
      );
      throw new AppError(`Failed to fetch revenue for period: ${period}`, {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function revenueByDateRange(
    storeId: string,
    startDate: string,
    endDate: string,
  ): Promise<RevenueResult> {
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

    const startTime = Date.now();
    logger.info({ storeId, startDate, endDate }, 'Revenue query: revenueByDateRange start');

    try {
      const row = await readonlyDb('orders')
        .where({ store_id: storeId })
        .whereIn('status', REVENUE_STATUSES)
        .where('date_created', '>=', startDate)
        .where('date_created', '<', endDate)
        .select(
          readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
          readonlyDb.raw('COUNT(*) AS order_count'),
          readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
        )
        .first<Record<string, unknown>>();

      const result = parseRevenueRow(row);
      const durationMs = Date.now() - startTime;

      logger.info(
        { storeId, startDate, endDate, durationMs, ...result },
        'Revenue query: revenueByDateRange completed',
      );
      return result;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, startDate, endDate, durationMs, error: (err as Error).message },
        'Revenue query: revenueByDateRange failed',
      );
      throw new AppError('Failed to fetch revenue for date range', {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function revenueComparison(
    storeId: string,
    period: RevenuePeriod,
  ): Promise<RevenueComparisonResult> {
    validateStoreId(storeId);

    const bounds = getPeriodBoundaries(period);
    const startTime = Date.now();
    logger.info({ storeId, period }, 'Revenue query: revenueComparison start');

    try {
      // Run current and previous period queries in parallel
      const [currentRow, previousRow] = await Promise.all([
        readonlyDb('orders')
          .where({ store_id: storeId })
          .whereIn('status', REVENUE_STATUSES)
          .whereRaw(`date_created >= ${bounds.currentStart}`)
          .whereRaw(`date_created < ${bounds.currentEnd}`)
          .select(
            readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
            readonlyDb.raw('COUNT(*) AS order_count'),
            readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
          )
          .first<Record<string, unknown>>(),

        readonlyDb('orders')
          .where({ store_id: storeId })
          .whereIn('status', REVENUE_STATUSES)
          .whereRaw(`date_created >= ${bounds.previousStart}`)
          .whereRaw(`date_created < ${bounds.previousEnd}`)
          .select(
            readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
            readonlyDb.raw('COUNT(*) AS order_count'),
            readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
          )
          .first<Record<string, unknown>>(),
      ]);

      const current = parseRevenueRow(currentRow);
      const previous = parseRevenueRow(previousRow);

      const revenueChange = Math.round((current.revenue - previous.revenue) * 100) / 100;
      const revenueChangePercent =
        previous.revenue === 0
          ? current.revenue > 0
            ? 100
            : 0
          : Math.round(((current.revenue - previous.revenue) / previous.revenue) * 10000) / 100;

      let trend: 'up' | 'down' | 'flat';
      if (revenueChange > 0) {
        trend = 'up';
      } else if (revenueChange < 0) {
        trend = 'down';
      } else {
        trend = 'flat';
      }

      const durationMs = Date.now() - startTime;
      logger.info(
        { storeId, period, durationMs, trend, revenueChangePercent },
        'Revenue query: revenueComparison completed',
      );

      return { current, previous, revenueChange, revenueChangePercent, trend };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, period, durationMs, error: (err as Error).message },
        'Revenue query: revenueComparison failed',
      );
      throw new AppError(`Failed to fetch revenue comparison for period: ${period}`, {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function revenueBreakdown(
    storeId: string,
    interval: BreakdownInterval,
    periods: number,
  ): Promise<RevenueBreakdownResult> {
    validateStoreId(storeId);

    if (!Number.isInteger(periods) || periods < 1 || periods > 365) {
      throw new ValidationError('periods must be an integer between 1 and 365');
    }

    const truncUnit = interval; // 'day', 'week', 'month' map directly to DATE_TRUNC units
    const intervalUnit = interval === 'day' ? 'days' : interval === 'week' ? 'weeks' : 'months';

    const startTime = Date.now();
    logger.info({ storeId, interval, periods }, 'Revenue query: revenueBreakdown start');

    try {
      const rows = await readonlyDb('orders')
        .where({ store_id: storeId })
        .whereIn('status', REVENUE_STATUSES)
        .whereRaw(`date_created >= NOW() - INTERVAL '${periods} ${intervalUnit}'`)
        .select(
          readonlyDb.raw(`DATE_TRUNC('${truncUnit}', date_created) AS period`),
          readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
          readonlyDb.raw('COUNT(*) AS order_count'),
        )
        .groupByRaw(`DATE_TRUNC('${truncUnit}', date_created)`)
        .orderByRaw(`DATE_TRUNC('${truncUnit}', date_created) ASC`)
        .limit(periods) as unknown as Array<Record<string, unknown>>;

      const breakdownRows: RevenueBreakdownRow[] = rows.map((row) => ({
        period: row.period instanceof Date
          ? row.period.toISOString()
          : String(row.period ?? ''),
        revenue: Math.round((parseFloat(String(row.total_revenue ?? '0')) || 0) * 100) / 100,
        orderCount: parseInt(String(row.order_count ?? '0'), 10) || 0,
      }));

      const total = Math.round(
        breakdownRows.reduce((sum, r) => sum + r.revenue, 0) * 100,
      ) / 100;

      const durationMs = Date.now() - startTime;
      logger.info(
        { storeId, interval, periods, durationMs, rowCount: breakdownRows.length, total },
        'Revenue query: revenueBreakdown completed',
      );

      return { rows: breakdownRows, total };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, interval, periods, durationMs, error: (err as Error).message },
        'Revenue query: revenueBreakdown failed',
      );
      throw new AppError(`Failed to fetch revenue breakdown by ${interval}`, {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  return {
    totalRevenue,
    revenueByPeriod,
    revenueByDateRange,
    revenueComparison,
    revenueBreakdown,
  };
}

export type RevenueQueries = ReturnType<typeof createRevenueQueries>;
