import type { Knex } from 'knex';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const MAX_COMPARISONS_PER_STORE = 20;
const REVENUE_STATUSES = ['completed', 'processing'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

export type ComparisonPreset =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'this_year'
  | 'last_7_days'
  | 'last_30_days';

const VALID_PRESETS: ComparisonPreset[] = [
  'today',
  'this_week',
  'this_month',
  'this_year',
  'last_7_days',
  'last_30_days',
];

export interface PeriodMetrics {
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
}

export interface ComparisonMetrics {
  current: PeriodMetrics;
  previous: PeriodMetrics;
  revenueChange: number;
  revenueChangePercent: number;
  orderCountChange: number;
  orderCountChangePercent: number;
  aovChange: number;
  aovChangePercent: number;
  trend: 'up' | 'down' | 'flat';
}

export interface BreakdownRow {
  date: string;
  currentRevenue: number;
  previousRevenue: number;
}

export interface ComparisonRecord {
  id: string;
  store_id: string;
  preset: string | null;
  current_start: string;
  current_end: string;
  previous_start: string;
  previous_end: string;
  metrics: string | ComparisonMetrics;
  breakdown: string | BreakdownRow[];
  created_at: string;
}

export interface ComparisonResponse {
  id: string;
  preset: string | null;
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  metrics: ComparisonMetrics;
  breakdown: BreakdownRow[];
  createdAt: string;
}

export interface GenerateComparisonPresetInput {
  preset: ComparisonPreset;
}

export interface GenerateComparisonCustomInput {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
}

export type GenerateComparisonInput =
  | GenerateComparisonPresetInput
  | GenerateComparisonCustomInput;

export interface DateComparisonServiceDeps {
  db: Knex;
  readonlyDb: Knex;
}

function parseJson<T>(value: string | T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error(`Invalid JSON in comparison data: ${value.substring(0, 100)}`);
    }
  }
  return value;
}

function toResponse(record: ComparisonRecord): ComparisonResponse {
  return {
    id: record.id,
    preset: record.preset,
    currentStart: record.current_start,
    currentEnd: record.current_end,
    previousStart: record.previous_start,
    previousEnd: record.previous_end,
    metrics: parseJson<ComparisonMetrics>(record.metrics),
    breakdown: parseJson<BreakdownRow[]>(record.breakdown),
    createdAt: record.created_at,
  };
}

function validateStoreId(storeId: string): void {
  if (!storeId || !UUID_RE.test(storeId)) {
    throw new ValidationError('Invalid storeId: must be a valid UUID');
  }
}

function validateDateString(value: string, fieldName: string): void {
  if (!value || !ISO_DATE_RE.test(value)) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be ISO 8601 format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ)`,
    );
  }
}

function getPresetBoundaries(preset: ComparisonPreset): {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
} {
  switch (preset) {
    case 'today':
      return {
        currentStart: "(DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
        currentEnd: 'NOW()',
        previousStart:
          "(DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - INTERVAL '1 day'",
        previousEnd: "(DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
      };
    case 'this_week':
      return {
        currentStart: "(DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
        currentEnd: 'NOW()',
        previousStart:
          "(DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - INTERVAL '1 week'",
        previousEnd: "(DATE_TRUNC('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
      };
    case 'this_month':
      return {
        currentStart: "(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
        currentEnd: 'NOW()',
        previousStart:
          "(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - INTERVAL '1 month'",
        previousEnd: "(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
      };
    case 'this_year':
      return {
        currentStart: "(DATE_TRUNC('year', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
        currentEnd: 'NOW()',
        previousStart:
          "(DATE_TRUNC('year', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') - INTERVAL '1 year'",
        previousEnd: "(DATE_TRUNC('year', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')",
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

function parsePeriodRow(row: Record<string, unknown> | undefined): PeriodMetrics {
  const revenue = parseFloat(String(row?.total_revenue ?? '0')) || 0;
  const orderCount = parseInt(String(row?.order_count ?? '0'), 10) || 0;
  const avgOrderValue = parseFloat(String(row?.avg_order_value ?? '0')) || 0;
  return {
    revenue: Math.round(revenue * 100) / 100,
    orderCount,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
  };
}

function computeChangePercent(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function computeMetrics(
  current: PeriodMetrics,
  previous: PeriodMetrics,
): ComparisonMetrics {
  const revenueChange = Math.round((current.revenue - previous.revenue) * 100) / 100;
  const revenueChangePercent = computeChangePercent(current.revenue, previous.revenue);
  const orderCountChange = current.orderCount - previous.orderCount;
  const orderCountChangePercent = computeChangePercent(
    current.orderCount,
    previous.orderCount,
  );
  const aovChange =
    Math.round((current.avgOrderValue - previous.avgOrderValue) * 100) / 100;
  const aovChangePercent = computeChangePercent(
    current.avgOrderValue,
    previous.avgOrderValue,
  );

  let trend: 'up' | 'down' | 'flat';
  if (revenueChange > 0) {
    trend = 'up';
  } else if (revenueChange < 0) {
    trend = 'down';
  } else {
    trend = 'flat';
  }

  return {
    current,
    previous,
    revenueChange,
    revenueChangePercent,
    orderCountChange,
    orderCountChangePercent,
    aovChange,
    aovChangePercent,
    trend,
  };
}

function isPresetInput(
  input: GenerateComparisonInput,
): input is GenerateComparisonPresetInput {
  return 'preset' in input && typeof input.preset === 'string';
}

export function createDateComparisonService(deps: DateComparisonServiceDeps) {
  const { db, readonlyDb } = deps;

  async function generateComparison(
    storeId: string,
    input: GenerateComparisonInput,
  ): Promise<ComparisonResponse> {
    validateStoreId(storeId);

    let currentStartExpr: string;
    let currentEndExpr: string;
    let previousStartExpr: string;
    let previousEndExpr: string;
    let preset: string | null = null;
    let currentStartDate: string;
    let currentEndDate: string;
    let previousStartDate: string;
    let previousEndDate: string;

    if (isPresetInput(input)) {
      if (!VALID_PRESETS.includes(input.preset)) {
        throw new ValidationError(
          `Invalid preset: must be one of ${VALID_PRESETS.join(', ')}`,
        );
      }
      preset = input.preset;
      const bounds = getPresetBoundaries(input.preset);
      currentStartExpr = bounds.currentStart;
      currentEndExpr = bounds.currentEnd;
      previousStartExpr = bounds.previousStart;
      previousEndExpr = bounds.previousEnd;

      // Resolve the actual dates for storage
      const dateRow = await readonlyDb.raw(
        `SELECT ${bounds.currentStart}::timestamptz AS cs,
                ${bounds.currentEnd}::timestamptz AS ce,
                ${bounds.previousStart}::timestamptz AS ps,
                ${bounds.previousEnd}::timestamptz AS pe`,
      );
      const dates = dateRow.rows[0];
      currentStartDate = dates.cs instanceof Date ? dates.cs.toISOString() : String(dates.cs);
      currentEndDate = dates.ce instanceof Date ? dates.ce.toISOString() : String(dates.ce);
      previousStartDate = dates.ps instanceof Date ? dates.ps.toISOString() : String(dates.ps);
      previousEndDate = dates.pe instanceof Date ? dates.pe.toISOString() : String(dates.pe);
    } else {
      // Custom date ranges
      validateDateString(input.currentStart, 'currentStart');
      validateDateString(input.currentEnd, 'currentEnd');
      validateDateString(input.previousStart, 'previousStart');
      validateDateString(input.previousEnd, 'previousEnd');

      if (input.currentStart > input.currentEnd) {
        throw new ValidationError('currentStart must be before or equal to currentEnd');
      }
      if (input.previousStart > input.previousEnd) {
        throw new ValidationError(
          'previousStart must be before or equal to previousEnd',
        );
      }

      currentStartDate = input.currentStart;
      currentEndDate = input.currentEnd;
      previousStartDate = input.previousStart;
      previousEndDate = input.previousEnd;
      currentStartExpr = '?';
      currentEndExpr = '?';
      previousStartExpr = '?';
      previousEndExpr = '?';
    }

    const startTime = Date.now();
    logger.info({ storeId, preset }, 'Date comparison: generate start');

    // Query metrics in parallel
    const isCustom = !isPresetInput(input);

    const currentQuery = readonlyDb('orders')
      .where({ store_id: storeId })
      .whereIn('status', [...REVENUE_STATUSES])
      .select(
        readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
        readonlyDb.raw('COUNT(*) AS order_count'),
        readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
      )
      .timeout(5000, { cancel: true });

    const previousQuery = readonlyDb('orders')
      .where({ store_id: storeId })
      .whereIn('status', [...REVENUE_STATUSES])
      .select(
        readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue'),
        readonlyDb.raw('COUNT(*) AS order_count'),
        readonlyDb.raw('COALESCE(ROUND(AVG(total), 2), 0) AS avg_order_value'),
      )
      .timeout(5000, { cancel: true });

    if (isCustom) {
      const customInput = input as GenerateComparisonCustomInput;
      currentQuery
        .whereRaw('date_created::date >= ?', [customInput.currentStart])
        .whereRaw('date_created::date <= ?', [customInput.currentEnd]);
      previousQuery
        .whereRaw('date_created::date >= ?', [customInput.previousStart])
        .whereRaw('date_created::date <= ?', [customInput.previousEnd]);
    } else {
      currentQuery
        .whereRaw(`date_created >= ${currentStartExpr}`)
        .whereRaw(`date_created < ${currentEndExpr}`);
      previousQuery
        .whereRaw(`date_created >= ${previousStartExpr}`)
        .whereRaw(`date_created < ${previousEndExpr}`);
    }

    // Daily breakdown query for current period
    const currentBreakdownQuery = readonlyDb('orders')
      .where({ store_id: storeId })
      .whereIn('status', [...REVENUE_STATUSES])
      .select(
        readonlyDb.raw("date_trunc('day', date_created)::date AS day"),
        readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS revenue'),
      )
      .groupByRaw("date_trunc('day', date_created)::date")
      .orderByRaw("date_trunc('day', date_created)::date ASC")
      .timeout(5000, { cancel: true });

    const previousBreakdownQuery = readonlyDb('orders')
      .where({ store_id: storeId })
      .whereIn('status', [...REVENUE_STATUSES])
      .select(
        readonlyDb.raw("date_trunc('day', date_created)::date AS day"),
        readonlyDb.raw('COALESCE(ROUND(SUM(total), 2), 0) AS revenue'),
      )
      .groupByRaw("date_trunc('day', date_created)::date")
      .orderByRaw("date_trunc('day', date_created)::date ASC")
      .timeout(5000, { cancel: true });

    if (isCustom) {
      const customInput = input as GenerateComparisonCustomInput;
      currentBreakdownQuery
        .whereRaw('date_created::date >= ?', [customInput.currentStart])
        .whereRaw('date_created::date <= ?', [customInput.currentEnd]);
      previousBreakdownQuery
        .whereRaw('date_created::date >= ?', [customInput.previousStart])
        .whereRaw('date_created::date <= ?', [customInput.previousEnd]);
    } else {
      currentBreakdownQuery
        .whereRaw(`date_created >= ${currentStartExpr}`)
        .whereRaw(`date_created < ${currentEndExpr}`);
      previousBreakdownQuery
        .whereRaw(`date_created >= ${previousStartExpr}`)
        .whereRaw(`date_created < ${previousEndExpr}`);
    }

    const [currentRow, previousRow, currentDays, previousDays] = await Promise.all([
      currentQuery.first<Record<string, unknown>>(),
      previousQuery.first<Record<string, unknown>>(),
      currentBreakdownQuery as unknown as Promise<Array<Record<string, unknown>>>,
      previousBreakdownQuery as unknown as Promise<Array<Record<string, unknown>>>,
    ]);

    const current = parsePeriodRow(currentRow);
    const previous = parsePeriodRow(previousRow);
    const metrics = computeMetrics(current, previous);

    // Build daily breakdown map
    const currentMap = new Map<string, number>();
    for (const row of currentDays) {
      const day =
        row.day instanceof Date
          ? row.day.toISOString().split('T')[0]
          : String(row.day ?? '');
      currentMap.set(day, parseFloat(String(row.revenue ?? '0')) || 0);
    }

    const previousMap = new Map<string, number>();
    for (const row of previousDays) {
      const day =
        row.day instanceof Date
          ? row.day.toISOString().split('T')[0]
          : String(row.day ?? '');
      previousMap.set(day, parseFloat(String(row.revenue ?? '0')) || 0);
    }

    // Merge all dates from both periods
    const allDates = new Set([...currentMap.keys(), ...previousMap.keys()]);
    const sortedDates = [...allDates].sort();

    const breakdown: BreakdownRow[] = sortedDates.map((date) => ({
      date,
      currentRevenue: Math.round((currentMap.get(date) ?? 0) * 100) / 100,
      previousRevenue: Math.round((previousMap.get(date) ?? 0) * 100) / 100,
    }));

    // Persist result
    const inserted = await db.transaction(async (trx) => {
      const countResult = await trx('date_range_comparisons')
        .where({ store_id: storeId })
        .count('* as count')
        .first<{ count: string }>();

      const total = parseInt(countResult?.count ?? '0', 10);
      if (total >= MAX_COMPARISONS_PER_STORE) {
        throw new ValidationError(
          `Maximum of ${MAX_COMPARISONS_PER_STORE} comparisons allowed per store`,
        );
      }

      const [row] = await trx('date_range_comparisons')
        .insert({
          store_id: storeId,
          preset,
          current_start: currentStartDate,
          current_end: currentEndDate,
          previous_start: previousStartDate,
          previous_end: previousEndDate,
          metrics: JSON.stringify(metrics),
          breakdown: JSON.stringify(breakdown),
        })
        .returning('*');

      return row;
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      { storeId, comparisonId: inserted.id, preset, durationMs, trend: metrics.trend },
      'Date comparison generated',
    );

    return toResponse(inserted as ComparisonRecord);
  }

  async function listComparisons(storeId: string): Promise<ComparisonResponse[]> {
    validateStoreId(storeId);

    const records = await db('date_range_comparisons')
      .where({ store_id: storeId })
      .orderBy('created_at', 'desc')
      .limit(MAX_COMPARISONS_PER_STORE)
      .select<ComparisonRecord[]>('*');

    return records.map(toResponse);
  }

  async function getComparison(
    storeId: string,
    comparisonId: string,
  ): Promise<ComparisonResponse> {
    validateStoreId(storeId);

    const record = await db('date_range_comparisons')
      .where({ id: comparisonId, store_id: storeId })
      .first<ComparisonRecord | undefined>();

    if (!record) {
      throw new NotFoundError('Comparison not found');
    }

    return toResponse(record);
  }

  async function deleteComparison(
    storeId: string,
    comparisonId: string,
  ): Promise<void> {
    validateStoreId(storeId);

    const deleted = await db('date_range_comparisons')
      .where({ id: comparisonId, store_id: storeId })
      .del();

    if (deleted === 0) {
      throw new NotFoundError('Comparison not found');
    }

    logger.info({ storeId, comparisonId }, 'Date comparison deleted');
  }

  return {
    generateComparison,
    listComparisons,
    getComparison,
    deleteComparison,
  };
}

export type DateComparisonService = ReturnType<typeof createDateComparisonService>;
