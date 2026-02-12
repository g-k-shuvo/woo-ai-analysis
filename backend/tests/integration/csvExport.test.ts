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

const { createCsvExportService } = await import('../../src/services/csvExportService.js');
const { csvExportRoutes } = await import('../../src/routes/exports/csv.js');
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');

// ── In-memory "database" ───────────────────────────────────────────

interface ChartRow {
  id: string;
  store_id: string;
  title: string;
  chart_config: string;
  position_index: number;
}

let chartRows: ChartRow[] = [];
let nextId = 1;

const STORE_ID_A = 'aaaa0000-0000-0000-0000-000000000001';
const STORE_ID_B = 'bbbb0000-0000-0000-0000-000000000002';
const UTF8_BOM = '\uFEFF';

function makeChartId(): string {
  const n = String(nextId++).padStart(4, '0');
  return `cccc0000-0000-0000-0000-cccc0000${n}`;
}

// ── Fake Knex query builder ─────────────────────────────────────────

function createFakeDb() {
  function createBuilder(tableName: string) {
    let whereFilter: Record<string, unknown> = {};
    let orderByCol: string | null = null;
    let orderByDir: string = 'asc';

    function getRows(): Array<Record<string, unknown>> {
      if (tableName === 'saved_charts') return chartRows as unknown as Array<Record<string, unknown>>;
      return [];
    }

    function filterRows(): Array<Record<string, unknown>> {
      let rows = [...getRows()];

      for (const [key, val] of Object.entries(whereFilter)) {
        rows = rows.filter((r) => r[key] === val);
      }

      if (orderByCol) {
        const col = orderByCol;
        const dir = orderByDir;
        rows.sort((a, b) => {
          const aVal = a[col] as number;
          const bVal = b[col] as number;
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
      orderBy(col: string, dir: string) {
        orderByCol = col;
        orderByDir = dir || 'asc';
        return builder;
      },
      select(...cols: string[]) {
        void cols;
        return Promise.resolve(filterRows());
      },
      first() {
        const row = filterRows()[0];
        return Promise.resolve(row);
      },
    };

    return builder;
  }

  return function fakeDb(tableName: string) {
    return createBuilder(tableName);
  };
}

// ── App builder ──────────────────────────────────────────────────────

async function buildApp(storeId: string): Promise<FastifyInstance> {
  const fakeDb = createFakeDb();
  const csvExportService = createCsvExportService({ db: fakeDb as unknown as Parameters<typeof createCsvExportService>[0]['db'] });

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
    csvExportRoutes(instance, { csvExportService }),
  );

  await app.ready();
  return app;
}

function addChart(storeId: string, title: string, config: Record<string, unknown>, positionIndex = 0): string {
  const id = makeChartId();
  chartRows.push({
    id,
    store_id: storeId,
    title,
    chart_config: JSON.stringify(config),
    position_index: positionIndex,
  });
  return id;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('CSV Export Integration', () => {
  beforeEach(() => {
    chartRows = [];
    nextId = 1;
  });

  // ── All charts export ───────────────────────────────────────────

  describe('POST /api/exports/csv — all charts', () => {
    it('returns CSV with all saved charts', async () => {
      addChart(STORE_ID_A, 'Revenue Chart', {
        type: 'bar',
        data: {
          labels: ['Jan', 'Feb'],
          datasets: [{ label: 'Revenue', data: [1000, 2000] }],
        },
      }, 0);

      addChart(STORE_ID_A, 'Orders Chart', {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb'],
          datasets: [{ label: 'Orders', data: [50, 75] }],
        },
      }, 1);

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');

      const content = response.body;
      expect(content.startsWith(UTF8_BOM)).toBe(true);

      // Both chart titles should be in the output
      expect(content).toContain('Revenue Chart');
      expect(content).toContain('Orders Chart');

      // Data should be present
      expect(content).toContain('Jan,1000');
      expect(content).toContain('Feb,2000');
      expect(content).toContain('Jan,50');
      expect(content).toContain('Feb,75');
    });

    it('returns 400 when no saved charts exist', async () => {
      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('No saved charts');
    });

    it('enforces store isolation — store B charts not visible to store A', async () => {
      addChart(STORE_ID_B, 'Store B Chart', {
        type: 'bar',
        data: {
          labels: ['X'],
          datasets: [{ label: 'Y', data: [999] }],
        },
      });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('No saved charts');
    });

    it('returns charts in position_index order', async () => {
      // Add charts out of order
      addChart(STORE_ID_A, 'Second Chart', {
        type: 'bar',
        data: { labels: ['B'], datasets: [{ label: 'V', data: [2] }] },
      }, 1);

      addChart(STORE_ID_A, 'First Chart', {
        type: 'bar',
        data: { labels: ['A'], datasets: [{ label: 'V', data: [1] }] },
      }, 0);

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const content = response.body;

      // "First Chart" should come before "Second Chart"
      const firstIdx = content.indexOf('First Chart');
      const secondIdx = content.indexOf('Second Chart');
      expect(firstIdx).toBeLessThan(secondIdx);
    });

    it('sets Content-Disposition with dashboard filename', async () => {
      addChart(STORE_ID_A, 'Chart', {
        type: 'bar',
        data: { labels: ['A'], datasets: [{ label: 'V', data: [1] }] },
      });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: {},
      });

      const disposition = response.headers['content-disposition'] as string;
      expect(disposition).toMatch(/dashboard-export-\d{4}-\d{2}-\d{2}\.csv/);
    });
  });

  // ── Single chart export ────────────────────────────────────────

  describe('POST /api/exports/csv — single chart', () => {
    it('returns CSV for a specific chart', async () => {
      const chartId = addChart(STORE_ID_A, 'My Chart', {
        type: 'bar',
        data: {
          labels: ['Q1', 'Q2', 'Q3'],
          datasets: [{ label: 'Sales', data: [100, 200, 300] }],
        },
      });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: { chartId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Label,Sales');
      expect(response.body).toContain('Q1,100');
      expect(response.body).toContain('Q2,200');
      expect(response.body).toContain('Q3,300');
    });

    it('returns 404 for non-existent chart', async () => {
      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: { chartId: 'cccc0000-0000-0000-0000-cccc00009999' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('enforces store isolation — cannot export chart from another store', async () => {
      const chartId = addChart(STORE_ID_B, 'Store B Only', {
        type: 'bar',
        data: { labels: ['X'], datasets: [{ label: 'Y', data: [1] }] },
      });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: { chartId },
      });

      expect(response.statusCode).toBe(404);
    });

    it('sets Content-Disposition with chart filename', async () => {
      const chartId = addChart(STORE_ID_A, 'Chart', {
        type: 'bar',
        data: { labels: ['A'], datasets: [{ label: 'V', data: [1] }] },
      });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: { chartId },
      });

      const disposition = response.headers['content-disposition'] as string;
      expect(disposition).toMatch(/chart-export-\d{4}-\d{2}-\d{2}\.csv/);
    });

    it('handles chart with multiple datasets', async () => {
      const chartId = addChart(STORE_ID_A, 'Multi DS', {
        type: 'bar',
        data: {
          labels: ['Jan'],
          datasets: [
            { label: 'Revenue', data: [1000] },
            { label: 'Profit', data: [300] },
          ],
        },
      });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: { chartId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('Label,Revenue,Profit');
      expect(response.body).toContain('Jan,1000,300');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('handles chart with special characters in data', async () => {
      addChart(STORE_ID_A, 'Special Chars', {
        type: 'bar',
        data: {
          labels: ['Widget, "Pro"', 'Item with\nnewline'],
          datasets: [{ label: 'Revenue ($)', data: [100, 200] }],
        },
      });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      // Values with special characters should be quoted
      expect(response.body).toContain('"Widget, ""Pro"""');
    });

    it('handles chart with empty datasets', async () => {
      addChart(STORE_ID_A, 'Empty DS', {
        type: 'bar',
        data: { labels: [], datasets: [] },
      });

      addChart(STORE_ID_A, 'Valid', {
        type: 'bar',
        data: { labels: ['A'], datasets: [{ label: 'V', data: [1] }] },
      });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('Empty DS');
      expect(response.body).toContain('Valid');
    });

    it('handles numeric label values', async () => {
      addChart(STORE_ID_A, 'Numeric', {
        type: 'bar',
        data: {
          labels: [2024, 2025, 2026],
          datasets: [{ label: 'Count', data: [10, 20, 30] }],
        },
      });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/exports/csv',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('2024,10');
      expect(response.body).toContain('2025,20');
      expect(response.body).toContain('2026,30');
    });
  });
});
