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

const { createSavedChartsService } = await import('../../src/services/savedChartsService.js');
const { createDashboardLayoutService } = await import(
  '../../src/services/dashboardLayoutService.js'
);
const { dashboardChartsRoutes } = await import('../../src/routes/dashboards/charts.js');
const { dashboardLayoutRoutes } = await import('../../src/routes/dashboards/layout.js');
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');

// ── In-memory "database" ───────────────────────────────────────────

interface ChartRow {
  id: string;
  store_id: string;
  title: string;
  query_text: string | null;
  chart_config: string;
  position_index: number;
  grid_x: number;
  grid_y: number;
  grid_w: number;
  grid_h: number;
  created_at: string;
  updated_at: string;
}

let chartRows: ChartRow[] = [];
let nextId = 1;

const STORE_ID_A = 'aaaa0000-0000-0000-0000-000000000001';
const STORE_ID_B = 'bbbb0000-0000-0000-0000-000000000002';

function makeId(): string {
  return `chart-${String(nextId++).padStart(4, '0')}`;
}

function createFakeDb() {
  function createBuilder(tableName: string) {
    let whereFilter: Record<string, unknown> = {};

    const builder: Record<string, unknown> = {
      where(filter: Record<string, unknown>) {
        whereFilter = { ...whereFilter, ...filter };
        return builder;
      },
      count(expr: string) {
        void expr;
        return {
          first() {
            const count = chartRows.filter(
              (r) => r.store_id === whereFilter.store_id,
            ).length;
            return Promise.resolve({ count: String(count) });
          },
        };
      },
      max(expr: unknown) {
        const exprStr = typeof expr === 'string' ? expr : '';
        return {
          first() {
            const storeCharts = chartRows.filter(
              (r) => r.store_id === whereFilter.store_id,
            );
            if (storeCharts.length === 0) {
              if (exprStr.includes('grid_y')) {
                return Promise.resolve({ max: null });
              }
              return Promise.resolve({ max_pos: null });
            }
            if (exprStr.includes('grid_y')) {
              const maxVal = Math.max(
                ...storeCharts.map((c) => c.grid_y + c.grid_h),
              );
              return Promise.resolve({ max: maxVal });
            }
            const maxPos = Math.max(
              ...storeCharts.map((c) => c.position_index),
            );
            return Promise.resolve({ max_pos: maxPos });
          },
        };
      },
      insert(data: Record<string, unknown>) {
        return {
          returning() {
            const newRow: ChartRow = {
              id: makeId(),
              store_id: data.store_id as string,
              title: data.title as string,
              query_text: (data.query_text as string) || null,
              chart_config: data.chart_config as string,
              position_index: data.position_index as number,
              grid_x: (data.grid_x as number) ?? 0,
              grid_y: (data.grid_y as number) ?? 0,
              grid_w: (data.grid_w as number) ?? 6,
              grid_h: (data.grid_h as number) ?? 4,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            chartRows.push(newRow);
            return Promise.resolve([newRow]);
          },
        };
      },
      orderBy(column: string, dir: string) {
        void column;
        void dir;
        return builder;
      },
      select() {
        const rows = chartRows
          .filter((r) => r.store_id === whereFilter.store_id)
          .sort((a, b) => a.position_index - b.position_index);
        return Promise.resolve(rows);
      },
      first() {
        const row = chartRows.find(
          (r) =>
            (!whereFilter.id || r.id === whereFilter.id) &&
            (!whereFilter.store_id || r.store_id === whereFilter.store_id),
        );
        return Promise.resolve(row);
      },
      update(data: Record<string, unknown>) {
        const idx = chartRows.findIndex(
          (r) =>
            (!whereFilter.id || r.id === whereFilter.id) &&
            (!whereFilter.store_id || r.store_id === whereFilter.store_id),
        );
        if (idx === -1) {
          return {
            returning() {
              return Promise.resolve([]);
            },
          };
        }
        const row = chartRows[idx];
        if (data.title !== undefined) row.title = data.title as string;
        if (data.chart_config !== undefined)
          row.chart_config = data.chart_config as string;
        if (data.position_index !== undefined)
          row.position_index = data.position_index as number;
        if (data.grid_x !== undefined) row.grid_x = data.grid_x as number;
        if (data.grid_y !== undefined) row.grid_y = data.grid_y as number;
        if (data.grid_w !== undefined) row.grid_w = data.grid_w as number;
        if (data.grid_h !== undefined) row.grid_h = data.grid_h as number;
        row.updated_at = new Date().toISOString();
        return {
          returning() {
            return Promise.resolve([row]);
          },
        };
      },
      del() {
        const before = chartRows.length;
        chartRows = chartRows.filter(
          (r) =>
            !(
              (!whereFilter.id || r.id === whereFilter.id) &&
              (!whereFilter.store_id || r.store_id === whereFilter.store_id)
            ),
        );
        return Promise.resolve(before - chartRows.length);
      },
    };

    void tableName;
    return builder;
  }

  const db = (tableName: string) => createBuilder(tableName);
  db.fn = { now: () => new Date().toISOString() };
  db.raw = (expr: string) => expr;
  db.transaction = async () => {
    const trx = (tableName: string) => {
      let whereFilter: Record<string, unknown> = {};
      const b: Record<string, unknown> = {
        where(filter: Record<string, unknown>) {
          whereFilter = { ...whereFilter, ...filter };
          return b;
        },
        update(data: Record<string, unknown>) {
          const idx = chartRows.findIndex(
            (r) =>
              (!whereFilter.id || r.id === whereFilter.id) &&
              (!whereFilter.store_id || r.store_id === whereFilter.store_id),
          );
          if (idx === -1) return Promise.resolve(0);
          const row = chartRows[idx];
          if (data.position_index !== undefined)
            row.position_index = data.position_index as number;
          if (data.grid_x !== undefined) row.grid_x = data.grid_x as number;
          if (data.grid_y !== undefined) row.grid_y = data.grid_y as number;
          if (data.grid_w !== undefined) row.grid_w = data.grid_w as number;
          if (data.grid_h !== undefined) row.grid_h = data.grid_h as number;
          row.updated_at = new Date().toISOString();
          return Promise.resolve(1);
        },
      };
      void tableName;
      return b;
    };
    trx.fn = { now: () => new Date().toISOString() };
    trx.commit = () => Promise.resolve();
    trx.rollback = () => Promise.resolve();
    return trx;
  };

  return db;
}

// ── App builder ─────────────────────────────────────────────────────

async function buildApp(
  storeId: string = STORE_ID_A,
): Promise<{ app: FastifyInstance }> {
  const fakeDb = createFakeDb();
  const savedChartsService = createSavedChartsService({
    db: fakeDb as unknown as Parameters<typeof createSavedChartsService>[0]['db'],
  });
  const dashboardLayoutService = createDashboardLayoutService({
    db: fakeDb as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
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
    dashboardChartsRoutes(instance, { savedChartsService }),
  );

  await app.register(async (instance) =>
    dashboardLayoutRoutes(instance, { dashboardLayoutService }),
  );

  await app.ready();
  return { app };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Dashboard Grid Layout Integration', () => {
  beforeEach(() => {
    chartRows = [];
    nextId = 1;
  });

  // ── New charts get default grid values ──────────────────────────

  describe('default grid values', () => {
    it('new chart gets default grid_w=6, grid_h=4', async () => {
      const { app } = await buildApp();

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: {
          title: 'Revenue Chart',
          chartConfig: { type: 'bar' },
        },
      });

      expect(createRes.statusCode).toBe(201);
      const chart = JSON.parse(createRes.body).data;
      expect(chart.gridW).toBe(6);
      expect(chart.gridH).toBe(4);
      expect(chart.gridX).toBe(0);
      expect(chart.gridY).toBe(0);
    });

    it('second chart auto-positions below first', async () => {
      const { app } = await buildApp();

      await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Chart 1', chartConfig: { type: 'bar' } },
      });

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Chart 2', chartConfig: { type: 'line' } },
      });

      const chart2 = JSON.parse(res2.body).data;
      expect(chart2.gridX).toBe(0);
      expect(chart2.gridY).toBe(4); // Below first chart (0 + h=4)
    });
  });

  // ── Grid fields in list response ────────────────────────────────

  describe('grid fields in list response', () => {
    it('lists charts with grid layout fields', async () => {
      const { app } = await buildApp();

      await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Chart A', chartConfig: { type: 'bar' } },
      });

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });

      const charts = JSON.parse(listRes.body).data.charts;
      expect(charts[0]).toHaveProperty('gridX');
      expect(charts[0]).toHaveProperty('gridY');
      expect(charts[0]).toHaveProperty('gridW');
      expect(charts[0]).toHaveProperty('gridH');
    });
  });

  // ── Grid layout update flow ─────────────────────────────────────

  describe('grid layout update', () => {
    it('updates grid positions via PUT /api/dashboards/grid-layout', async () => {
      const { app } = await buildApp();

      // Create two charts
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Chart A', chartConfig: { type: 'bar' } },
      });
      const id1 = JSON.parse(res1.body).data.id;

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Chart B', chartConfig: { type: 'line' } },
      });
      const id2 = JSON.parse(res2.body).data.id;

      // Update grid layout — move chart B to top-right
      const layoutRes = await app.inject({
        method: 'PUT',
        url: '/api/dashboards/grid-layout',
        payload: {
          items: [
            { id: id1, gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
            { id: id2, gridX: 6, gridY: 0, gridW: 6, gridH: 4 },
          ],
        },
      });

      expect(layoutRes.statusCode).toBe(200);
      expect(JSON.parse(layoutRes.body).data.updated).toBe(true);

      // Verify positions were updated
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });

      const charts = JSON.parse(listRes.body).data.charts;
      const chartA = charts.find((c: { id: string }) => c.id === id1);
      const chartB = charts.find((c: { id: string }) => c.id === id2);

      expect(chartA.gridX).toBe(0);
      expect(chartA.gridW).toBe(6);
      expect(chartB.gridX).toBe(6);
      expect(chartB.gridW).toBe(6);
    });

    it('persists resized chart dimensions', async () => {
      const { app } = await buildApp();

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Big Chart', chartConfig: { type: 'bar' } },
      });
      const chartId = JSON.parse(createRes.body).data.id;

      // Resize to full width
      await app.inject({
        method: 'PUT',
        url: '/api/dashboards/grid-layout',
        payload: {
          items: [
            { id: chartId, gridX: 0, gridY: 0, gridW: 12, gridH: 6 },
          ],
        },
      });

      // Verify
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });

      const chart = JSON.parse(listRes.body).data.charts[0];
      expect(chart.gridW).toBe(12);
      expect(chart.gridH).toBe(6);
    });
  });

  // ── Store isolation ─────────────────────────────────────────────

  describe('store isolation for grid layout', () => {
    it('store A cannot update grid layout for store B charts', async () => {
      const { app: appA } = await buildApp(STORE_ID_A);
      const { app: appB } = await buildApp(STORE_ID_B);

      // Store B creates a chart
      const createRes = await appB.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Store B Chart', chartConfig: { type: 'bar' } },
      });
      const chartId = JSON.parse(createRes.body).data.id;

      // Store A tries to update its grid layout — should fail (404)
      const layoutRes = await appA.inject({
        method: 'PUT',
        url: '/api/dashboards/grid-layout',
        payload: {
          items: [
            { id: chartId, gridX: 0, gridY: 0, gridW: 12, gridH: 8 },
          ],
        },
      });

      expect(layoutRes.statusCode).toBe(404);
    });
  });

  // ── Validation ──────────────────────────────────────────────────

  describe('validation', () => {
    it('rejects empty items array', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/dashboards/grid-layout',
        payload: { items: [] },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects gridW below minimum', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/dashboards/grid-layout',
        payload: {
          items: [
            { id: 'chart-1', gridX: 0, gridY: 0, gridW: 2, gridH: 4 },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects gridH above maximum', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/dashboards/grid-layout',
        payload: {
          items: [
            { id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 9 },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
