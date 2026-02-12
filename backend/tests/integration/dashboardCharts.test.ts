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
const { dashboardChartsRoutes } = await import('../../src/routes/dashboards/charts.js');
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');

// ── In-memory "database" ───────────────────────────────────────────

interface ChartRow {
  id: string;
  store_id: string;
  title: string;
  query_text: string | null;
  chart_config: string;
  position_index: number;
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

// Mock Knex query builder that simulates a real database
function createFakeDb() {
  function createBuilder(tableName: string) {
    let whereFilter: Record<string, unknown> = {};

    const builder: Record<string, unknown> = {
      where(filter: Record<string, unknown>) {
        whereFilter = { ...whereFilter, ...filter };
        return builder;
      },
      count(expr: string) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      max(expr: string) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        void expr;
        return {
          first() {
            const storeCharts = chartRows.filter(
              (r) => r.store_id === whereFilter.store_id,
            );
            if (storeCharts.length === 0) {
              return Promise.resolve({ max_pos: null });
            }
            const maxPos = Math.max(...storeCharts.map((c) => c.position_index));
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
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            chartRows.push(newRow);
            return Promise.resolve([newRow]);
          },
        };
      },
      orderBy(column: string, dir: string) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  db.transaction = async () => {
    // Simplified transaction — wraps the same builder, supports commit/rollback
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
): Promise<{ app: FastifyInstance; fakeDb: ReturnType<typeof createFakeDb> }> {
  const fakeDb = createFakeDb();
  const savedChartsService = createSavedChartsService({
    db: fakeDb as unknown as Parameters<typeof createSavedChartsService>[0]['db'],
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

  await app.ready();
  return { app, fakeDb };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Dashboard Charts Integration', () => {
  beforeEach(() => {
    chartRows = [];
    nextId = 1;
  });

  // ── Full CRUD flow ──────────────────────────────────────────────

  describe('full CRUD flow', () => {
    it('creates, lists, updates, and deletes a chart', async () => {
      const { app } = await buildApp();

      // Create
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: {
          title: 'Revenue by Product',
          queryText: 'Show revenue by product',
          chartConfig: { type: 'bar', data: {} },
        },
      });

      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body).data;
      expect(created.title).toBe('Revenue by Product');
      expect(created.positionIndex).toBe(0);
      const chartId = created.id;

      // List
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });

      expect(listRes.statusCode).toBe(200);
      const charts = JSON.parse(listRes.body).data.charts;
      expect(charts).toHaveLength(1);
      expect(charts[0].id).toBe(chartId);

      // Update
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/dashboards/charts/${chartId}`,
        payload: { title: 'Updated Title' },
      });

      expect(updateRes.statusCode).toBe(200);
      const updated = JSON.parse(updateRes.body).data;
      expect(updated.title).toBe('Updated Title');

      // Delete
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/dashboards/charts/${chartId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.body).data.deleted).toBe(true);

      // Verify deleted
      const listAfterDelete = await app.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });

      expect(JSON.parse(listAfterDelete.body).data.charts).toHaveLength(0);
    });
  });

  // ── Position ordering ──────────────────────────────────────────

  describe('position ordering', () => {
    it('auto-increments position_index', async () => {
      const { app } = await buildApp();

      // Create first chart
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Chart 1', chartConfig: { type: 'bar' } },
      });
      expect(JSON.parse(res1.body).data.positionIndex).toBe(0);

      // Create second chart
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Chart 2', chartConfig: { type: 'line' } },
      });
      expect(JSON.parse(res2.body).data.positionIndex).toBe(1);

      // Create third chart
      const res3 = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Chart 3', chartConfig: { type: 'pie' } },
      });
      expect(JSON.parse(res3.body).data.positionIndex).toBe(2);
    });

    it('lists charts in position_index order', async () => {
      const { app } = await buildApp();

      await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'First', chartConfig: { type: 'bar' } },
      });

      await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Second', chartConfig: { type: 'line' } },
      });

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });

      const charts = JSON.parse(listRes.body).data.charts;
      expect(charts[0].title).toBe('First');
      expect(charts[1].title).toBe('Second');
    });
  });

  // ── Layout reordering ─────────────────────────────────────────

  describe('layout reordering', () => {
    it('updates position indices', async () => {
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

      // Swap positions
      const layoutRes = await app.inject({
        method: 'PUT',
        url: '/api/dashboards/layout',
        payload: {
          positions: [
            { id: id1, positionIndex: 1 },
            { id: id2, positionIndex: 0 },
          ],
        },
      });

      expect(layoutRes.statusCode).toBe(200);

      // Verify new order
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });

      const charts = JSON.parse(listRes.body).data.charts;
      expect(charts[0].title).toBe('Chart B');
      expect(charts[1].title).toBe('Chart A');
    });
  });

  // ── Store isolation ───────────────────────────────────────────

  describe('store isolation', () => {
    it('store A cannot see store B charts', async () => {
      const { app: appA } = await buildApp(STORE_ID_A);
      const { app: appB } = await buildApp(STORE_ID_B);

      // Store A creates a chart
      await appA.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Store A Chart', chartConfig: { type: 'bar' } },
      });

      // Store B creates a chart
      await appB.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Store B Chart', chartConfig: { type: 'line' } },
      });

      // Store A should only see its chart
      const listA = await appA.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });
      const chartsA = JSON.parse(listA.body).data.charts;
      expect(chartsA).toHaveLength(1);
      expect(chartsA[0].title).toBe('Store A Chart');

      // Store B should only see its chart
      const listB = await appB.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });
      const chartsB = JSON.parse(listB.body).data.charts;
      expect(chartsB).toHaveLength(1);
      expect(chartsB[0].title).toBe('Store B Chart');
    });

    it('store A cannot delete store B chart', async () => {
      const { app: appA } = await buildApp(STORE_ID_A);
      const { app: appB } = await buildApp(STORE_ID_B);

      // Store B creates a chart
      const createRes = await appB.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Store B Chart', chartConfig: { type: 'bar' } },
      });
      const chartId = JSON.parse(createRes.body).data.id;

      // Store A tries to delete it
      const deleteRes = await appA.inject({
        method: 'DELETE',
        url: `/api/dashboards/charts/${chartId}`,
      });

      // NotFoundError → 404
      expect(deleteRes.statusCode).toBe(404);

      // Verify chart still exists for store B
      const listB = await appB.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });
      expect(JSON.parse(listB.body).data.charts).toHaveLength(1);
    });
  });

  // ── Max charts limit ──────────────────────────────────────────

  describe('max charts limit', () => {
    it('rejects save when 20 charts already exist', async () => {
      const { app } = await buildApp();

      // Create 20 charts
      for (let i = 0; i < 20; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/dashboards/charts',
          payload: { title: `Chart ${i}`, chartConfig: { type: 'bar' } },
        });
      }

      // 21st should fail
      const res = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Chart 21', chartConfig: { type: 'bar' } },
      });

      // ValidationError → 400
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.message || body.error?.message || '').toContain('Maximum');
    });
  });

  // ── Chart config round-trip ───────────────────────────────────

  describe('chart config round-trip', () => {
    it('preserves complex chart config through save and retrieve', async () => {
      const { app } = await buildApp();

      const complexConfig = {
        type: 'bar',
        data: {
          labels: ['Jan', 'Feb', 'Mar'],
          datasets: [
            {
              label: 'Revenue',
              data: [1000, 2000, 1500],
              backgroundColor: ['rgba(54,162,235,0.6)'],
              borderColor: ['rgba(54,162,235,1)'],
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            title: { display: true, text: 'Monthly Revenue' },
          },
        },
      };

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: {
          title: 'Monthly Revenue',
          chartConfig: complexConfig,
        },
      });

      const chartId = JSON.parse(createRes.body).data.id;

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/dashboards/charts',
      });

      const charts = JSON.parse(listRes.body).data.charts;
      const found = charts.find((c: { id: string }) => c.id === chartId);
      expect(found.chartConfig).toEqual(complexConfig);
    });
  });

  // ── Input validation integration ──────────────────────────────

  describe('input validation', () => {
    it('rejects empty title', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: '', chartConfig: { type: 'bar' } },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects missing chartConfig', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/dashboards/charts',
        payload: { title: 'Test' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects layout with empty positions', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'PUT',
        url: '/api/dashboards/layout',
        payload: { positions: [] },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
