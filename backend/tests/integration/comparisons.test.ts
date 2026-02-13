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

const { createDateComparisonService } = await import(
  '../../src/services/dateComparisonService.js'
);
const { comparisonRoutes } = await import(
  '../../src/routes/comparisons/index.js'
);
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');

// ── In-memory "database" ───────────────────────────────────────────

interface ComparisonRow {
  id: string;
  store_id: string;
  preset: string | null;
  current_start: string;
  current_end: string;
  previous_start: string;
  previous_end: string;
  metrics: string;
  breakdown: string;
  created_at: string;
}

interface DailyRevenueRow {
  day: string;
  revenue: string;
  total_revenue: string;
  order_count: string;
  avg_order_value: string;
}

let comparisonRows: ComparisonRow[] = [];
let orderRows: DailyRevenueRow[] = [];
let nextId = 1;

const STORE_ID_A = 'aaaa0000-0000-0000-0000-000000000001';
const STORE_ID_B = 'bbbb0000-0000-0000-0000-000000000002';

function makeComparisonId(): string {
  const n = String(nextId++).padStart(4, '0');
  return `cccc0000-0000-0000-0000-cccc0000${n}`;
}

function seedOrderData(count: number, startRevenue = 100) {
  orderRows = [];
  const baseDate = new Date('2025-11-15');
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() + i);
    const revenue = startRevenue + i * 5;
    orderRows.push({
      day: d.toISOString().split('T')[0],
      revenue: String(revenue),
      total_revenue: String(revenue),
      order_count: '3',
      avg_order_value: String(Math.round((revenue / 3) * 100) / 100),
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

    function getRows(): ComparisonRow[] {
      if (tableName === 'date_range_comparisons') return comparisonRows;
      return [];
    }

    function filterRows(): ComparisonRow[] {
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
        const newRow: ComparisonRow = {
          id: makeComparisonId(),
          store_id: data.store_id as string,
          preset: (data.preset as string) || null,
          current_start: data.current_start as string,
          current_end: data.current_end as string,
          previous_start: data.previous_start as string,
          previous_end: data.previous_end as string,
          metrics: data.metrics as string,
          breakdown: data.breakdown as string,
          created_at: new Date().toISOString(),
        };
        comparisonRows.push(newRow);
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
          const idx = comparisonRows.indexOf(row);
          if (idx >= 0) comparisonRows.splice(idx, 1);
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
    raw: (...args: unknown[]) => unknown;
    transaction: (cb: (trx: unknown) => Promise<unknown>) => Promise<unknown>;
  };

  fakeDb.raw = (...args: unknown[]) => {
    // When called with a SELECT ... AS cs/ce/ps/pe, return resolved dates
    const sql = String(args[0] || '');
    if (sql.includes('AS cs')) {
      return Promise.resolve({
        rows: [{
          cs: '2026-02-01T00:00:00.000Z',
          ce: '2026-02-13T12:00:00.000Z',
          ps: '2026-01-01T00:00:00.000Z',
          pe: '2026-02-01T00:00:00.000Z',
        }],
      });
    }
    return sql;
  };

  fakeDb.transaction = async (cb: (trx: unknown) => Promise<unknown>) => {
    const trx = function (tableName: string) {
      return createBuilder(tableName);
    } as unknown as ((tableName: string) => Record<string, unknown>) & {
      raw: (...args: unknown[]) => unknown;
    };
    trx.raw = (...args: unknown[]) => String(args[0] || '');
    return cb(trx);
  };

  return fakeDb;
}

function createFakeReadonlyDb() {
  function getMetricsRow(storeFilter: unknown) {
    if (storeFilter === STORE_ID_A || !storeFilter) {
      if (orderRows.length > 0) {
        const totalRevenue = orderRows.reduce((s, r) => s + parseFloat(r.revenue), 0);
        const count = orderRows.length * 3;
        return {
          total_revenue: String(totalRevenue),
          order_count: String(count),
          avg_order_value: String(Math.round((totalRevenue / count) * 100) / 100),
        };
      }
      return { total_revenue: '0', order_count: '0', avg_order_value: '0' };
    }
    return { total_revenue: '0', order_count: '0', avg_order_value: '0' };
  }

  function getBreakdownRows(storeFilter: unknown) {
    if (storeFilter === STORE_ID_A || !storeFilter) {
      return [...orderRows];
    }
    return [];
  }

  function createBuilder(tableName: string) {
    let whereFilter: Record<string, unknown> = {};
    let useFirst = false;
    let hasSelect = false;

    const builder: Record<string, unknown> = {
      where(...args: unknown[]) {
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
          whereFilter = { ...whereFilter, ...(args[0] as Record<string, unknown>) };
        }
        return builder;
      },
      whereIn(_col: string, _vals: unknown[]) {
        return builder;
      },
      whereRaw() {
        return builder;
      },
      select(..._cols: unknown[]) {
        hasSelect = true;
        return builder;
      },
      first() {
        useFirst = true;
        // Return a thenable that resolves to a single row
        const result = {
          then(resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
            try {
              const row = tableName === 'orders'
                ? getMetricsRow(whereFilter.store_id)
                : undefined;
              return Promise.resolve(row).then(resolve, reject);
            } catch (err) {
              return Promise.reject(err).then(resolve, reject);
            }
          },
        };
        return result;
      },
      groupByRaw() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      orderByRaw() {
        return builder;
      },
      timeout() {
        return builder;
      },
      // Make builder thenable so `await builder` resolves to breakdown rows
      then(resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        if (tableName === 'orders' && hasSelect && !useFirst) {
          return Promise.resolve(getBreakdownRows(whereFilter.store_id)).then(resolve, reject);
        }
        return Promise.resolve([]).then(resolve, reject);
      },
    };

    return builder;
  }

  const fakeReadonlyDb = function (tableName: string) {
    return createBuilder(tableName);
  } as unknown as ((tableName: string) => Record<string, unknown>) & {
    raw: (...args: unknown[]) => unknown;
  };

  fakeReadonlyDb.raw = (...args: unknown[]) => {
    const sql = String(args[0] || '');
    // When resolving preset date boundaries
    if (sql.includes('AS cs')) {
      return Promise.resolve({
        rows: [{
          cs: '2026-02-01T00:00:00.000Z',
          ce: '2026-02-13T12:00:00.000Z',
          ps: '2026-01-01T00:00:00.000Z',
          pe: '2026-02-01T00:00:00.000Z',
        }],
      });
    }
    return sql;
  };

  return fakeReadonlyDb;
}

// ── App builder ──────────────────────────────────────────────────────

async function buildApp(storeId: string): Promise<FastifyInstance> {
  const fakeDb = createFakeDb();
  const fakeReadonlyDb = createFakeReadonlyDb();

  const dateComparisonService = createDateComparisonService({
    db: fakeDb as unknown as Parameters<typeof createDateComparisonService>[0]['db'],
    readonlyDb: fakeReadonlyDb as unknown as Parameters<typeof createDateComparisonService>[0]['readonlyDb'],
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
    comparisonRoutes(instance, { dateComparisonService }),
  );

  await app.ready();
  return app;
}

function seedComparison(storeId: string, overrides: Partial<ComparisonRow> = {}): string {
  const id = makeComparisonId();
  comparisonRows.push({
    id,
    store_id: storeId,
    preset: 'this_month',
    current_start: '2026-02-01T00:00:00.000Z',
    current_end: '2026-02-13T12:00:00.000Z',
    previous_start: '2026-01-01T00:00:00.000Z',
    previous_end: '2026-02-01T00:00:00.000Z',
    metrics: JSON.stringify({
      current: { revenue: 1200, orderCount: 10, avgOrderValue: 120 },
      previous: { revenue: 1000, orderCount: 8, avgOrderValue: 125 },
      revenueChange: 200,
      revenueChangePercent: 20,
      orderCountChange: 2,
      orderCountChangePercent: 25,
      aovChange: -5,
      aovChangePercent: -4,
      trend: 'up',
    }),
    breakdown: JSON.stringify([
      { date: '2026-02-01', currentRevenue: 400, previousRevenue: 350 },
      { date: '2026-02-02', currentRevenue: 450, previousRevenue: 320 },
    ]),
    created_at: '2026-02-13T10:00:00.000Z',
    ...overrides,
  });
  return id;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Date Range Comparisons Integration', () => {
  beforeEach(() => {
    comparisonRows = [];
    orderRows = [];
    nextId = 1;
  });

  // ── Full CRUD flow ──────────────────────────────────────────────

  describe('Full CRUD flow', () => {
    it('generates, lists, gets, and deletes a comparison', async () => {
      seedOrderData(30);
      const app = await buildApp(STORE_ID_A);

      // Generate
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: { preset: 'this_month' },
      });

      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body);
      expect(created.success).toBe(true);
      expect(created.data.preset).toBe('this_month');
      expect(created.data.metrics).toHaveProperty('current');
      expect(created.data.metrics).toHaveProperty('previous');
      expect(created.data.metrics).toHaveProperty('trend');

      const comparisonId = created.data.id;

      // List
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/comparisons',
      });

      expect(listRes.statusCode).toBe(200);
      const listed = JSON.parse(listRes.body);
      expect(listed.data.comparisons).toHaveLength(1);
      expect(listed.data.comparisons[0].id).toBe(comparisonId);

      // Get
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/comparisons/${comparisonId}`,
      });

      expect(getRes.statusCode).toBe(200);
      const fetched = JSON.parse(getRes.body);
      expect(fetched.data.id).toBe(comparisonId);

      // Delete
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/comparisons/${comparisonId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.body).data.deleted).toBe(true);

      // Verify deleted
      const listRes2 = await app.inject({
        method: 'GET',
        url: '/api/comparisons',
      });

      expect(JSON.parse(listRes2.body).data.comparisons).toHaveLength(0);
    });
  });

  // ── Generate ──────────────────────────────────────────────────────

  describe('POST /api/comparisons', () => {
    it('generates a preset comparison', async () => {
      seedOrderData(30);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: { preset: 'this_month' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.preset).toBe('this_month');
      expect(body.data.metrics.current).toHaveProperty('revenue');
      expect(body.data.metrics.current).toHaveProperty('orderCount');
      expect(body.data.metrics.current).toHaveProperty('avgOrderValue');
    });

    it('generates a custom date range comparison', async () => {
      seedOrderData(30);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: {
          currentStart: '2026-02-01',
          currentEnd: '2026-02-28',
          previousStart: '2026-01-01',
          previousEnd: '2026-01-31',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.preset).toBeNull();
    });

    it('returns metrics with change calculations', async () => {
      seedOrderData(30);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: { preset: 'this_month' },
      });

      const body = JSON.parse(response.body);
      const m = body.data.metrics;
      expect(m).toHaveProperty('revenueChange');
      expect(m).toHaveProperty('revenueChangePercent');
      expect(m).toHaveProperty('orderCountChange');
      expect(m).toHaveProperty('orderCountChangePercent');
      expect(m).toHaveProperty('aovChange');
      expect(m).toHaveProperty('aovChangePercent');
      expect(['up', 'down', 'flat']).toContain(m.trend);
    });

    it('returns breakdown with daily data', async () => {
      seedOrderData(30);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: { preset: 'last_30_days' },
      });

      const body = JSON.parse(response.body);
      expect(Array.isArray(body.data.breakdown)).toBe(true);
      if (body.data.breakdown.length > 0) {
        expect(body.data.breakdown[0]).toHaveProperty('date');
        expect(body.data.breakdown[0]).toHaveProperty('currentRevenue');
        expect(body.data.breakdown[0]).toHaveProperty('previousRevenue');
      }
    });

    it('returns 400 for invalid preset', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: { preset: 'invalid_preset' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for empty body', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts all valid presets', async () => {
      seedOrderData(30);
      const presets = ['today', 'this_week', 'this_month', 'this_year', 'last_7_days', 'last_30_days'];

      for (const preset of presets) {
        const app = await buildApp(STORE_ID_A);
        const response = await app.inject({
          method: 'POST',
          url: '/api/comparisons',
          payload: { preset },
        });
        expect(response.statusCode).toBe(201);
      }
    });

    it('enforces max 20 comparisons per store', async () => {
      seedOrderData(30);
      const app = await buildApp(STORE_ID_A);

      // Create 20 comparisons
      for (let i = 0; i < 20; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/comparisons',
          payload: { preset: 'this_month' },
        });
        expect(res.statusCode).toBe(201);
      }

      // 21st should fail
      const res = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: { preset: 'this_month' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain('Maximum of 20');
    });

    it('handles zero order data gracefully', async () => {
      // No order data seeded
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: { preset: 'this_month' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.metrics.current.revenue).toBe(0);
      expect(body.data.metrics.trend).toBe('flat');
    });
  });

  // ── List ──────────────────────────────────────────────────────────

  describe('GET /api/comparisons', () => {
    it('returns empty array when no comparisons', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: '/api/comparisons',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.comparisons).toEqual([]);
    });

    it('returns only comparisons for the authenticated store', async () => {
      seedComparison(STORE_ID_A);
      seedComparison(STORE_ID_B);

      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: '/api/comparisons',
      });

      const body = JSON.parse(response.body);
      expect(body.data.comparisons).toHaveLength(1);
    });

    it('returns multiple comparisons', async () => {
      seedComparison(STORE_ID_A);
      seedComparison(STORE_ID_A);
      seedComparison(STORE_ID_A);

      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: '/api/comparisons',
      });

      const body = JSON.parse(response.body);
      expect(body.data.comparisons).toHaveLength(3);
    });
  });

  // ── Get ───────────────────────────────────────────────────────────

  describe('GET /api/comparisons/:id', () => {
    it('returns a specific comparison', async () => {
      const id = seedComparison(STORE_ID_A);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: `/api/comparisons/${id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe(id);
    });

    it('returns 404 for non-existent comparison', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: '/api/comparisons/cccc0000-0000-0000-0000-cccc00009999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('enforces store isolation on get', async () => {
      const id = seedComparison(STORE_ID_B);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: `/api/comparisons/${id}`,
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns parsed metrics and breakdown', async () => {
      const id = seedComparison(STORE_ID_A);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'GET',
        url: `/api/comparisons/${id}`,
      });

      const body = JSON.parse(response.body);
      expect(body.data.metrics.current.revenue).toBe(1200);
      expect(body.data.metrics.previous.revenue).toBe(1000);
      expect(body.data.metrics.trend).toBe('up');
      expect(body.data.breakdown).toHaveLength(2);
    });
  });

  // ── Delete ────────────────────────────────────────────────────────

  describe('DELETE /api/comparisons/:id', () => {
    it('deletes an existing comparison', async () => {
      const id = seedComparison(STORE_ID_A);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/comparisons/${id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).data.deleted).toBe(true);
      expect(comparisonRows).toHaveLength(0);
    });

    it('returns 404 for non-existent comparison', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/comparisons/cccc0000-0000-0000-0000-cccc00009999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('enforces store isolation on delete', async () => {
      const id = seedComparison(STORE_ID_B);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/comparisons/${id}`,
      });

      expect(response.statusCode).toBe(404);
      expect(comparisonRows).toHaveLength(1);
    });
  });
});
