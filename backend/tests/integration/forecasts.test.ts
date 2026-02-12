import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mock logger ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Dynamic imports (after mocks) ───────────────────────────────────

const { createRevenueForecastService } = await import(
  '../../src/services/revenueForecastService.js'
);
const { forecastRoutes } = await import(
  '../../src/routes/forecasts/index.js'
);
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');

// ── In-memory "database" ───────────────────────────────────────────

interface ForecastRow {
  id: string;
  store_id: string;
  days_ahead: number;
  historical_days: number;
  data_points: string;
  summary: string;
  created_at: string;
}

interface DailyRevenueRow {
  day: string;
  revenue: string;
}

let forecastRows: ForecastRow[] = [];
let orderRows: DailyRevenueRow[] = [];
let nextId = 1;

const STORE_ID_A = 'aaaa0000-0000-0000-0000-000000000001';
const STORE_ID_B = 'bbbb0000-0000-0000-0000-000000000002';

function makeForecastId(): string {
  const n = String(nextId++).padStart(4, '0');
  return `ffff0000-0000-0000-0000-ffff0000${n}`;
}

function seedDailyRevenue(count: number, startRevenue = 100) {
  orderRows = [];
  const baseDate = new Date('2025-11-15');
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() + i);
    orderRows.push({
      day: d.toISOString().split('T')[0],
      revenue: String(startRevenue + i * 5),
    });
  }
}

// ── Fake Knex query builder ─────────────────────────────────────────

function createFakeDb() {
  function createBuilder(tableName: string) {
    let whereFilter: Record<string, unknown> = {};
    let orderByCol: string | null = null;
    let orderByDir: string = 'asc';
    let countMode = false;

    function getRows(): ForecastRow[] {
      if (tableName === 'revenue_forecasts') return forecastRows;
      return [];
    }

    function filterRows(): ForecastRow[] {
      let rows = [...getRows()];

      for (const [key, val] of Object.entries(whereFilter)) {
        rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[key] === val);
      }

      if (orderByCol) {
        const col = orderByCol;
        const dir = orderByDir;
        rows.sort((a, b) => {
          const aVal = (a as unknown as Record<string, unknown>)[col] as string;
          const bVal = (b as unknown as Record<string, unknown>)[col] as string;
          if (aVal < bVal) return dir === 'asc' ? -1 : 1;
          if (aVal > bVal) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }

      return rows;
    }

    const builder: Record<string, unknown> = {
      where(filter: Record<string, unknown>) {
        whereFilter = { ...whereFilter, ...filter };
        return builder;
      },
      andWhere(filter: Record<string, unknown>) {
        whereFilter = { ...whereFilter, ...filter };
        return builder;
      },
      whereIn(_col: string, _vals: unknown[]) {
        // For integration tests we include all rows
        return builder;
      },
      orderBy(col: string, dir: string) {
        orderByCol = col;
        orderByDir = dir || 'asc';
        return builder;
      },
      count(_expr: string) {
        countMode = true;
        return builder;
      },
      limit() {
        return builder;
      },
      select(..._cols: unknown[]) {
        return Promise.resolve(filterRows());
      },
      first() {
        if (countMode) {
          countMode = false;
          const count = filterRows().length;
          return Promise.resolve({ count: String(count) });
        }
        const row = filterRows()[0];
        return Promise.resolve(row);
      },
      insert(data: Record<string, unknown>) {
        const newRow: ForecastRow = {
          id: makeForecastId(),
          store_id: data.store_id as string,
          days_ahead: data.days_ahead as number,
          historical_days: data.historical_days as number,
          data_points: data.data_points as string,
          summary: data.summary as string,
          created_at: new Date().toISOString(),
        };
        forecastRows.push(newRow);
        return {
          returning() {
            return Promise.resolve([newRow]);
          },
        };
      },
      del() {
        const rows = filterRows();
        const count = rows.length;
        for (const row of rows) {
          const idx = forecastRows.indexOf(row);
          if (idx >= 0) forecastRows.splice(idx, 1);
        }
        return Promise.resolve(count);
      },
      groupByRaw() {
        return builder;
      },
    };

    return builder;
  }

  const fakeDb = function (tableName: string) {
    return createBuilder(tableName);
  } as unknown as ((tableName: string) => Record<string, unknown>) & {
    raw: (sql: string) => string;
    transaction: (cb: (trx: unknown) => Promise<unknown>) => Promise<unknown>;
  };

  fakeDb.raw = (sql: string) => sql;

  // transaction: pass a trx that behaves like fakeDb itself
  fakeDb.transaction = async (cb: (trx: unknown) => Promise<unknown>) => {
    const trx = function (tableName: string) {
      return createBuilder(tableName);
    } as unknown as ((tableName: string) => Record<string, unknown>) & {
      raw: (sql: string) => string;
    };
    trx.raw = (sql: string) => sql;
    return cb(trx);
  };

  return fakeDb;
}

function createFakeReadonlyDb() {
  function createBuilder(tableName: string) {
    let whereFilter: Record<string, unknown> = {};

    const builder: Record<string, unknown> = {
      where(...args: unknown[]) {
        // Handle both where({key: val}) and where('col', '>=', val) signatures
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
          whereFilter = { ...whereFilter, ...(args[0] as Record<string, unknown>) };
        }
        // For 3-arg form (col, op, val), just ignore — we include all seeded rows
        return builder;
      },
      whereIn(_col: string, _vals: unknown[]) {
        return builder;
      },
      select(..._cols: unknown[]) {
        // For orders table, return the seeded daily revenue
        if (tableName === 'orders') {
          // filter by store_id
          const storeFilter = whereFilter.store_id;
          // Return the seeded rows (all belong to the "current" store)
          if (storeFilter === STORE_ID_A || !storeFilter) {
            return Promise.resolve([...orderRows]);
          }
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
      groupByRaw() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      timeout() {
        return builder;
      },
    };

    return builder;
  }

  const fakeReadonlyDb = function (tableName: string) {
    return createBuilder(tableName);
  } as unknown as ((tableName: string) => Record<string, unknown>) & {
    raw: (sql: string) => string;
  };

  fakeReadonlyDb.raw = (sql: string) => sql;

  return fakeReadonlyDb;
}

// ── App builder ──────────────────────────────────────────────────────

async function buildApp(storeId: string): Promise<FastifyInstance> {
  const fakeDb = createFakeDb();
  const fakeReadonlyDb = createFakeReadonlyDb();

  const revenueForecastService = createRevenueForecastService({
    db: fakeDb as unknown as Parameters<typeof createRevenueForecastService>[0]['db'],
    readonlyDb: fakeReadonlyDb as unknown as Parameters<typeof createRevenueForecastService>[0]['readonlyDb'],
  });

  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  app.decorateRequest('store', undefined);
  app.addHook('onRequest', async (request) => {
    request.store = {
      id: storeId,
      store_url: 'https://example.com',
      plan: 'free',
      is_active: true,
    };
  });

  await app.register(async (instance) =>
    forecastRoutes(instance, { revenueForecastService }),
  );

  await app.ready();
  return app;
}

function seedForecast(storeId: string, overrides: Partial<ForecastRow> = {}): string {
  const id = makeForecastId();
  forecastRows.push({
    id,
    store_id: storeId,
    days_ahead: 30,
    historical_days: 90,
    data_points: JSON.stringify([
      { date: '2026-02-13', predicted: 1250, type: 'forecast' },
    ]),
    summary: JSON.stringify({
      avgDailyRevenue: 1200,
      projectedTotal: 37500,
      trend: 'up',
    }),
    created_at: '2026-02-12T10:00:00.000Z',
    ...overrides,
  });
  return id;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Revenue Forecasts Integration', () => {
  beforeEach(() => {
    forecastRows = [];
    orderRows = [];
    nextId = 1;
  });

  // ── Full CRUD flow ──────────────────────────────────────────────

  describe('Full CRUD flow', () => {
    it('generates, lists, gets, and deletes a forecast', async () => {
      seedDailyRevenue(30);
      const app = await buildApp(STORE_ID_A);

      // Generate
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 30 },
      });

      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body);
      expect(created.success).toBe(true);
      expect(created.data.daysAhead).toBe(30);
      expect(created.data.dataPoints.length).toBeGreaterThan(0);
      expect(created.data.summary.trend).toBeTruthy();

      const forecastId = created.data.id;

      // List
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/forecasts',
      });

      expect(listRes.statusCode).toBe(200);
      const listed = JSON.parse(listRes.body);
      expect(listed.data.forecasts).toHaveLength(1);
      expect(listed.data.forecasts[0].id).toBe(forecastId);

      // Get
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/forecasts/${forecastId}`,
      });

      expect(getRes.statusCode).toBe(200);
      const fetched = JSON.parse(getRes.body);
      expect(fetched.data.id).toBe(forecastId);

      // Delete
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/forecasts/${forecastId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.body).data.deleted).toBe(true);

      // Verify deleted
      const listRes2 = await app.inject({
        method: 'GET',
        url: '/api/forecasts',
      });

      expect(JSON.parse(listRes2.body).data.forecasts).toHaveLength(0);
    });
  });

  // ── Generate ──────────────────────────────────────────────────────

  describe('POST /api/forecasts', () => {
    it('generates a 7-day forecast', async () => {
      seedDailyRevenue(30);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 7 },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.daysAhead).toBe(7);
      expect(body.data.dataPoints).toHaveLength(7);
    });

    it('generates a 14-day forecast', async () => {
      seedDailyRevenue(30);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 14 },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.daysAhead).toBe(14);
      expect(body.data.dataPoints).toHaveLength(14);
    });

    it('generates a 30-day forecast', async () => {
      seedDailyRevenue(60);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 30 },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.daysAhead).toBe(30);
      expect(body.data.dataPoints).toHaveLength(30);
    });

    it('returns 400 for invalid daysAhead', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 15 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for missing daysAhead', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when insufficient historical data', async () => {
      seedDailyRevenue(3); // only 3 days, need 7
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 30 },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('7 days');
    });

    it('returns 400 when no order history', async () => {
      // No orderRows seeded
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 30 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('enforces max 10 forecasts per store', async () => {
      seedDailyRevenue(30);
      const app = await buildApp(STORE_ID_A);

      // Create 10 forecasts
      for (let i = 0; i < 10; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/forecasts',
          payload: { daysAhead: 7 },
        });
        expect(res.statusCode).toBe(201);
      }

      // 11th should fail
      const res = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 7 },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain('Maximum of 10');
    });

    it('includes summary with avgDailyRevenue, projectedTotal, and trend', async () => {
      seedDailyRevenue(30, 100);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 7 },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.summary).toHaveProperty('avgDailyRevenue');
      expect(body.data.summary).toHaveProperty('projectedTotal');
      expect(body.data.summary).toHaveProperty('trend');
      expect(typeof body.data.summary.avgDailyRevenue).toBe('number');
      expect(typeof body.data.summary.projectedTotal).toBe('number');
      expect(['up', 'down', 'flat']).toContain(body.data.summary.trend);
    });

    it('forecast data points have date and predicted fields', async () => {
      seedDailyRevenue(30);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 7 },
      });

      const body = JSON.parse(response.body);
      const dp = body.data.dataPoints[0];
      expect(dp).toHaveProperty('date');
      expect(dp).toHaveProperty('predicted');
      expect(dp).toHaveProperty('type');
      expect(dp.type).toBe('forecast');
    });

    it('predicted revenue is never negative', async () => {
      // Seed decreasing revenue to try to get negative predictions
      orderRows = [];
      const baseDate = new Date('2025-11-15');
      for (let i = 0; i < 30; i++) {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + i);
        orderRows.push({
          day: d.toISOString().split('T')[0],
          revenue: String(Math.max(0, 1000 - i * 50)),
        });
      }

      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/forecasts',
        payload: { daysAhead: 30 },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      for (const dp of body.data.dataPoints) {
        expect(dp.predicted).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── List ──────────────────────────────────────────────────────────

  describe('GET /api/forecasts', () => {
    it('returns empty array when no forecasts', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: '/api/forecasts',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.forecasts).toEqual([]);
    });

    it('returns only forecasts for the authenticated store', async () => {
      seedForecast(STORE_ID_A);
      seedForecast(STORE_ID_B);

      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: '/api/forecasts',
      });

      const body = JSON.parse(response.body);
      expect(body.data.forecasts).toHaveLength(1);
    });

    it('returns multiple forecasts', async () => {
      seedForecast(STORE_ID_A);
      seedForecast(STORE_ID_A);
      seedForecast(STORE_ID_A);

      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: '/api/forecasts',
      });

      const body = JSON.parse(response.body);
      expect(body.data.forecasts).toHaveLength(3);
    });
  });

  // ── Get ───────────────────────────────────────────────────────────

  describe('GET /api/forecasts/:id', () => {
    it('returns a specific forecast', async () => {
      const id = seedForecast(STORE_ID_A);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: `/api/forecasts/${id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe(id);
    });

    it('returns 404 for non-existent forecast', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: '/api/forecasts/ffff0000-0000-0000-0000-ffff00009999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('enforces store isolation on get', async () => {
      const id = seedForecast(STORE_ID_B);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: `/api/forecasts/${id}`,
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ── Delete ────────────────────────────────────────────────────────

  describe('DELETE /api/forecasts/:id', () => {
    it('deletes an existing forecast', async () => {
      const id = seedForecast(STORE_ID_A);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/forecasts/${id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).data.deleted).toBe(true);
      expect(forecastRows).toHaveLength(0);
    });

    it('returns 404 for non-existent forecast', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/forecasts/ffff0000-0000-0000-0000-ffff00009999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('enforces store isolation on delete', async () => {
      const id = seedForecast(STORE_ID_B);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/forecasts/${id}`,
      });

      expect(response.statusCode).toBe(404);
      expect(forecastRows).toHaveLength(1);
    });
  });
});
