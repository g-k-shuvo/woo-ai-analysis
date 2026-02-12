import type { Knex } from 'knex';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const MAX_FORECASTS_PER_STORE = 10;
const MIN_HISTORICAL_DAYS = 7;
const HISTORICAL_LOOKBACK_DAYS = 90;
const VALID_DAYS_AHEAD = [7, 14, 30] as const;

export interface ForecastDataPoint {
  date: string;
  predicted: number;
  type: 'forecast';
}

export interface ForecastSummary {
  avgDailyRevenue: number;
  projectedTotal: number;
  trend: 'up' | 'down' | 'flat';
}

export interface RevenueForecastRecord {
  id: string;
  store_id: string;
  days_ahead: number;
  historical_days: number;
  data_points: string | ForecastDataPoint[];
  summary: string | ForecastSummary;
  created_at: string;
}

export interface RevenueForecastResponse {
  id: string;
  daysAhead: number;
  historicalDays: number;
  dataPoints: ForecastDataPoint[];
  summary: ForecastSummary;
  createdAt: string;
}

export interface GenerateForecastInput {
  daysAhead: number;
}

export interface RevenueForecastServiceDeps {
  db: Knex;
  readonlyDb: Knex;
}

interface DailyRevenueRow {
  day: string;
  revenue: string;
}

function parseJson<T>(value: string | T): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value;
}

function toResponse(record: RevenueForecastRecord): RevenueForecastResponse {
  return {
    id: record.id,
    daysAhead: record.days_ahead,
    historicalDays: record.historical_days,
    dataPoints: parseJson<ForecastDataPoint[]>(record.data_points),
    summary: parseJson<ForecastSummary>(record.summary),
    createdAt: record.created_at,
  };
}

/**
 * Simple linear regression: y = slope * x + intercept.
 * x values are 0-indexed day offsets, y values are daily revenues.
 */
function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: values[0] };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export function createRevenueForecastService(deps: RevenueForecastServiceDeps) {
  const { db, readonlyDb } = deps;

  async function generateForecast(
    storeId: string,
    input: GenerateForecastInput,
  ): Promise<RevenueForecastResponse> {
    // Validate daysAhead
    if (!VALID_DAYS_AHEAD.includes(input.daysAhead as typeof VALID_DAYS_AHEAD[number])) {
      throw new ValidationError('daysAhead must be 7, 14, or 30');
    }

    // Check max forecasts per store
    const countResult = await db('revenue_forecasts')
      .where({ store_id: storeId })
      .count('* as count')
      .first<{ count: string }>();

    const total = parseInt(countResult?.count ?? '0', 10);
    if (total >= MAX_FORECASTS_PER_STORE) {
      throw new ValidationError(`Maximum of ${MAX_FORECASTS_PER_STORE} forecasts allowed per store`);
    }

    // Query historical daily revenue from orders table using read-only DB
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - HISTORICAL_LOOKBACK_DAYS);

    const dailyRevenue = await readonlyDb('orders')
      .where({ store_id: storeId })
      .where('date_created', '>=', startDate.toISOString())
      .whereIn('status', ['completed', 'processing'])
      .groupByRaw("date_trunc('day', date_created)::date")
      .orderBy('day', 'asc')
      .select(
        readonlyDb.raw("date_trunc('day', date_created)::date as day"),
        readonlyDb.raw('SUM(total) as revenue'),
      ) as DailyRevenueRow[];

    if (dailyRevenue.length < MIN_HISTORICAL_DAYS) {
      throw new ValidationError(
        `At least ${MIN_HISTORICAL_DAYS} days of order history required to generate a forecast. Found ${dailyRevenue.length} days.`,
      );
    }

    // Extract revenue values for regression
    const revenueValues = dailyRevenue.map((row) => parseFloat(row.revenue));

    // Compute linear regression
    const { slope, intercept } = linearRegression(revenueValues);

    // Generate forecast data points
    const lastDay = new Date(dailyRevenue[dailyRevenue.length - 1].day);
    const n = revenueValues.length;
    const dataPoints: ForecastDataPoint[] = [];

    for (let i = 1; i <= input.daysAhead; i++) {
      const forecastDate = new Date(lastDay);
      forecastDate.setUTCDate(forecastDate.getUTCDate() + i);

      const predicted = slope * (n - 1 + i) + intercept;
      // Revenue can't be negative
      const clampedPredicted = Math.max(0, Math.round(predicted * 100) / 100);

      dataPoints.push({
        date: forecastDate.toISOString().split('T')[0],
        predicted: clampedPredicted,
        type: 'forecast',
      });
    }

    // Compute summary
    const avgDailyRevenue = revenueValues.reduce((sum, v) => sum + v, 0) / revenueValues.length;
    const projectedTotal = dataPoints.reduce((sum, dp) => sum + dp.predicted, 0);
    const trend: 'up' | 'down' | 'flat' =
      slope > 0.01 ? 'up' : slope < -0.01 ? 'down' : 'flat';

    const summary: ForecastSummary = {
      avgDailyRevenue: Math.round(avgDailyRevenue * 100) / 100,
      projectedTotal: Math.round(projectedTotal * 100) / 100,
      trend,
    };

    // Insert forecast
    const [inserted] = await db('revenue_forecasts')
      .insert({
        store_id: storeId,
        days_ahead: input.daysAhead,
        historical_days: dailyRevenue.length,
        data_points: JSON.stringify(dataPoints),
        summary: JSON.stringify(summary),
      })
      .returning('*');

    logger.info(
      { storeId, forecastId: inserted.id, daysAhead: input.daysAhead, historicalDays: dailyRevenue.length },
      'Revenue forecast generated',
    );

    return toResponse(inserted as RevenueForecastRecord);
  }

  async function listForecasts(storeId: string): Promise<RevenueForecastResponse[]> {
    const records = await db('revenue_forecasts')
      .where({ store_id: storeId })
      .orderBy('created_at', 'desc')
      .select<RevenueForecastRecord[]>('*');

    return records.map(toResponse);
  }

  async function getForecast(storeId: string, forecastId: string): Promise<RevenueForecastResponse> {
    const record = await db('revenue_forecasts')
      .where({ id: forecastId, store_id: storeId })
      .first<RevenueForecastRecord | undefined>();

    if (!record) {
      throw new NotFoundError('Forecast not found');
    }

    return toResponse(record);
  }

  async function deleteForecast(storeId: string, forecastId: string): Promise<void> {
    const deleted = await db('revenue_forecasts')
      .where({ id: forecastId, store_id: storeId })
      .del();

    if (deleted === 0) {
      throw new NotFoundError('Forecast not found');
    }

    logger.info({ storeId, forecastId }, 'Revenue forecast deleted');
  }

  return {
    generateForecast,
    listForecasts,
    getForecast,
    deleteForecast,
  };
}

export type RevenueForecastService = ReturnType<typeof createRevenueForecastService>;
