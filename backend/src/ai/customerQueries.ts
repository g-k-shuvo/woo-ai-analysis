/**
 * Customer Query Service — pre-built, parameterized SQL queries for common customer metrics.
 *
 * Provides fast, reliable customer data without the AI pipeline overhead.
 * All queries:
 * - Include WHERE store_id = ? for tenant isolation
 * - Use parameterized placeholders (no string concatenation)
 * - Round monetary values to 2 decimal places
 * - Run on the read-only database connection
 * - Never expose raw PII (emails) — only display_name is returned
 */

import type { Knex } from 'knex';
import { AppError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

const DEFAULT_TOP_CUSTOMERS_LIMIT = 10;
const MAX_TOP_CUSTOMERS_LIMIT = 100;

const VALID_PERIODS = new Set<string>([
  'today', 'this_week', 'this_month', 'this_year', 'last_7_days', 'last_30_days',
]);

export type CustomerPeriod =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'last_7_days'
  | 'last_30_days';

export interface NewVsReturningResult {
  newCustomers: number;
  returningCustomers: number;
  totalCustomers: number;
}

export interface TopCustomerResult {
  displayName: string;
  totalSpent: number;
  orderCount: number;
}

export interface NewCustomersResult {
  count: number;
}

export interface CustomerLifetimeValueResult {
  avgTotalSpent: number;
  avgOrderCount: number;
  totalCustomers: number;
}

export interface CustomerQueryDeps {
  readonlyDb: Knex;
}

function validateStoreId(storeId: string): void {
  if (!storeId || !UUID_RE.test(storeId)) {
    throw new ValidationError('Invalid storeId: must be a valid UUID');
  }
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TOP_CUSTOMERS_LIMIT) {
    throw new ValidationError(`limit must be an integer between 1 and ${MAX_TOP_CUSTOMERS_LIMIT}`);
  }
}

function validatePeriod(period: string): asserts period is CustomerPeriod {
  if (!VALID_PERIODS.has(period)) {
    throw new ValidationError(
      `Invalid period: must be one of ${[...VALID_PERIODS].join(', ')}`,
    );
  }
}

async function measureQuery<T>(
  logContext: Record<string, unknown>,
  queryName: string,
  errorMessage: string,
  queryFn: () => Promise<T>,
): Promise<T> {
  const startTime = Date.now();
  logger.info(logContext, `Customer query: ${queryName} start`);
  try {
    const result = await queryFn();
    const durationMs = Date.now() - startTime;
    const resultCount = Array.isArray(result) ? result.length : undefined;
    logger.info(
      { ...logContext, durationMs, resultCount },
      `Customer query: ${queryName} completed`,
    );
    return result;
  } catch (err) {
    if (err instanceof AppError) throw err;
    const durationMs = Date.now() - startTime;
    logger.error(
      { ...logContext, durationMs, error: (err as Error).message },
      `Customer query: ${queryName} failed`,
    );
    throw new AppError(errorMessage, {
      cause: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

function getCustomerPeriodStart(period: CustomerPeriod): string {
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

export function createCustomerQueries(deps: CustomerQueryDeps) {
  const { readonlyDb } = deps;

  async function newVsReturning(storeId: string): Promise<NewVsReturningResult> {
    validateStoreId(storeId);

    return measureQuery({ storeId }, 'newVsReturning', 'Failed to fetch new vs returning customers', async () => {
      const rows = await readonlyDb('customers')
        .where({ store_id: storeId })
        .where('order_count', '>', 0)
        .select(
          readonlyDb.raw(
            "CASE WHEN order_count = 1 THEN 'new' ELSE 'returning' END AS customer_type",
          ),
          readonlyDb.raw('COUNT(*) AS customer_count'),
        )
        .groupByRaw(
          "CASE WHEN order_count = 1 THEN 'new' ELSE 'returning' END",
        ) as unknown as Array<Record<string, unknown>>;

      let newCustomers = 0;
      let returningCustomers = 0;

      for (const row of rows) {
        const count = parseInt(String(row.customer_count ?? '0'), 10) || 0;
        if (String(row.customer_type) === 'new') {
          newCustomers = count;
        } else {
          returningCustomers = count;
        }
      }

      return {
        newCustomers,
        returningCustomers,
        totalCustomers: newCustomers + returningCustomers,
      };
    });
  }

  async function _getTopCustomers(
    storeId: string,
    limit: number,
    orderByColumn: 'total_spent' | 'order_count',
  ): Promise<TopCustomerResult[]> {
    const queryName = orderByColumn === 'total_spent' ? 'topCustomersBySpending' : 'topCustomersByOrderCount';
    const errorMsg = `Failed to fetch top customers by ${orderByColumn === 'total_spent' ? 'spending' : 'order count'}`;

    validateStoreId(storeId);
    validateLimit(limit);

    return measureQuery({ storeId, limit }, queryName, errorMsg, async () => {
      const rows = await readonlyDb('customers')
        .where({ store_id: storeId })
        .where('order_count', '>', 0)
        .select(
          'display_name',
          readonlyDb.raw('COALESCE(ROUND(total_spent, 2), 0) AS total_spent'),
          'order_count',
        )
        .orderBy(orderByColumn, 'desc')
        .limit(limit) as unknown as Array<Record<string, unknown>>;

      return rows.map((row) => ({
        displayName: String(row.display_name ?? 'Anonymous'),
        totalSpent: parseFloat(String(row.total_spent ?? '0')) || 0,
        orderCount: parseInt(String(row.order_count ?? '0'), 10) || 0,
      }));
    });
  }

  async function topCustomersBySpending(
    storeId: string,
    limit: number = DEFAULT_TOP_CUSTOMERS_LIMIT,
  ): Promise<TopCustomerResult[]> {
    return _getTopCustomers(storeId, limit, 'total_spent');
  }

  async function topCustomersByOrderCount(
    storeId: string,
    limit: number = DEFAULT_TOP_CUSTOMERS_LIMIT,
  ): Promise<TopCustomerResult[]> {
    return _getTopCustomers(storeId, limit, 'order_count');
  }

  async function newCustomersByPeriod(
    storeId: string,
    period: CustomerPeriod,
  ): Promise<NewCustomersResult> {
    validateStoreId(storeId);
    validatePeriod(period);

    const periodStart = getCustomerPeriodStart(period);

    return measureQuery({ storeId, period }, 'newCustomersByPeriod', `Failed to fetch new customers for period: ${period}`, async () => {
      const row = await readonlyDb('customers')
        .where({ store_id: storeId })
        .whereRaw(`first_order_date >= ${periodStart}`)
        .select(
          readonlyDb.raw('COUNT(*) AS customer_count'),
        )
        .first<Record<string, unknown>>();

      return {
        count: parseInt(String(row?.customer_count ?? '0'), 10) || 0,
      };
    });
  }

  async function newCustomersByDateRange(
    storeId: string,
    startDate: string,
    endDate: string,
  ): Promise<NewCustomersResult> {
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
      'newCustomersByDateRange',
      'Failed to fetch new customers for date range',
      async () => {
        const row = await readonlyDb('customers')
          .where({ store_id: storeId })
          .where('first_order_date', '>=', startDate)
          .where('first_order_date', '<=', inclusiveEndDate)
          .select(
            readonlyDb.raw('COUNT(*) AS customer_count'),
          )
          .first<Record<string, unknown>>();

        return {
          count: parseInt(String(row?.customer_count ?? '0'), 10) || 0,
        };
      },
    );
  }

  async function customerLifetimeValue(storeId: string): Promise<CustomerLifetimeValueResult> {
    validateStoreId(storeId);

    return measureQuery({ storeId }, 'customerLifetimeValue', 'Failed to fetch customer lifetime value', async () => {
      const row = await readonlyDb('customers')
        .where({ store_id: storeId })
        .where('order_count', '>', 0)
        .select(
          readonlyDb.raw('COALESCE(ROUND(AVG(total_spent), 2), 0) AS avg_total_spent'),
          readonlyDb.raw('COALESCE(ROUND(AVG(order_count), 2), 0) AS avg_order_count'),
          readonlyDb.raw('COUNT(*) AS total_customers'),
        )
        .first<Record<string, unknown>>();

      return {
        avgTotalSpent: parseFloat(String(row?.avg_total_spent ?? '0')) || 0,
        avgOrderCount: parseFloat(String(row?.avg_order_count ?? '0')) || 0,
        totalCustomers: parseInt(String(row?.total_customers ?? '0'), 10) || 0,
      };
    });
  }

  return {
    newVsReturning,
    topCustomersBySpending,
    topCustomersByOrderCount,
    newCustomersByPeriod,
    newCustomersByDateRange,
    customerLifetimeValue,
  };
}

export type CustomerQueries = ReturnType<typeof createCustomerQueries>;
