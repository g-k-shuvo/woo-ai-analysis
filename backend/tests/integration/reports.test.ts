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

// ── Mock pdfkit ─────────────────────────────────────────────────────

jest.unstable_mockModule('pdfkit', () => {
  return {
    default: class MockPDFDocument {
      private callbacks: Record<string, (...args: unknown[]) => void> = {};
      constructor() {}
      on(event: string, cb: (...args: unknown[]) => void) {
        this.callbacks[event] = cb;
        return this;
      }
      fontSize() {
        return this;
      }
      text() {
        return this;
      }
      moveDown() {
        return this;
      }
      fillColor() {
        return this;
      }
      moveTo() {
        return this;
      }
      lineTo() {
        return this;
      }
      stroke() {
        return this;
      }
      image() {
        return this;
      }
      addPage() {
        return this;
      }
      get y() {
        return 100;
      }
      end() {
        if (this.callbacks['data']) this.callbacks['data'](Buffer.from('fake-pdf'));
        if (this.callbacks['end']) this.callbacks['end']();
      }
    },
  };
});

// ── Mock chartRenderer ──────────────────────────────────────────────

const mockChartRenderer = {
  renderToBuffer: jest.fn<() => Promise<Buffer | null>>().mockResolvedValue(Buffer.from('fake-png')),
  renderToDataURI: jest.fn<() => Promise<string | null>>().mockResolvedValue('data:image/png;base64,...'),
};

// ── Dynamic imports (after mocks) ───────────────────────────────────

const { createPdfReportService } = await import('../../src/services/pdfReportService.js');
const { reportRoutes } = await import('../../src/routes/reports/index.js');
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');

// ── In-memory "database" ───────────────────────────────────────────

interface ReportRow {
  id: string;
  store_id: string;
  title: string;
  status: string;
  chart_count: number;
  file_data: string | null;
  created_at: string;
}

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

let reportRows: ReportRow[] = [];
let chartRows: ChartRow[] = [];
let nextReportId = 1;
let nextChartId = 1;

const STORE_ID_A = 'aaaa0000-0000-0000-0000-000000000001';
const STORE_ID_B = 'bbbb0000-0000-0000-0000-000000000002';

function makeReportId(): string {
  return `report-${String(nextReportId++).padStart(4, '0')}`;
}

function makeChartId(): string {
  return `chart-${String(nextChartId++).padStart(4, '0')}`;
}

// ── Fake Knex query builder ─────────────────────────────────────────

function createFakeDb() {
  function createBuilder(tableName: string) {
    let whereFilter: Record<string, unknown> = {};
    let whereInField: string | null = null;
    let whereInValues: unknown[] = [];
    let orderByCol: string | null = null;
    let orderByDir: string = 'asc';
    let limitCount: number | null = null;
    let selectColumns: string[] = [];

    function getRows(): Array<Record<string, unknown>> {
      if (tableName === 'reports') return reportRows as unknown as Array<Record<string, unknown>>;
      if (tableName === 'saved_charts') return chartRows as unknown as Array<Record<string, unknown>>;
      return [];
    }

    function filterRows(): Array<Record<string, unknown>> {
      let rows = [...getRows()];

      // Apply where filters
      for (const [key, val] of Object.entries(whereFilter)) {
        rows = rows.filter((r) => r[key] === val);
      }

      // Apply whereIn filters
      if (whereInField && whereInValues.length > 0) {
        rows = rows.filter((r) => whereInValues.includes(r[whereInField!]));
      }

      // Apply orderBy
      if (orderByCol) {
        const col = orderByCol;
        const dir = orderByDir;
        rows.sort((a, b) => {
          const aVal = a[col] as string;
          const bVal = b[col] as string;
          if (aVal < bVal) return dir === 'asc' ? -1 : 1;
          if (aVal > bVal) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }

      // Apply limit
      if (limitCount !== null) {
        rows = rows.slice(0, limitCount);
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
      whereIn(field: string, values: unknown[]) {
        whereInField = field;
        whereInValues = values;
        return builder;
      },
      count(expr: string) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        void expr;
        return {
          first() {
            const count = filterRows().length;
            return Promise.resolve({ count: String(count) });
          },
        };
      },
      first() {
        const row = filterRows()[0];
        return Promise.resolve(row);
      },
      insert(data: Record<string, unknown>) {
        return {
          returning() {
            if (tableName === 'reports') {
              const newRow: ReportRow = {
                id: makeReportId(),
                store_id: data.store_id as string,
                title: data.title as string,
                status: data.status as string,
                chart_count: data.chart_count as number,
                file_data: (data.file_data as string) || null,
                created_at: new Date().toISOString(),
              };
              reportRows.push(newRow);
              return Promise.resolve([newRow]);
            }
            if (tableName === 'saved_charts') {
              const newRow: ChartRow = {
                id: makeChartId(),
                store_id: data.store_id as string,
                title: data.title as string,
                query_text: (data.query_text as string) || null,
                chart_config: data.chart_config as string,
                position_index: (data.position_index as number) ?? 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              chartRows.push(newRow);
              return Promise.resolve([newRow]);
            }
            return Promise.resolve([]);
          },
        };
      },
      orderBy(column: string, dir: string = 'asc') {
        orderByCol = column;
        orderByDir = dir;
        return builder;
      },
      select(...args: unknown[]) {
        // select can be called as select('*') or select('id', 'title', ...)
        if (args.length === 1 && args[0] === '*') {
          selectColumns = [];
        } else {
          selectColumns = args.map(String);
        }
        const rows = filterRows();
        if (selectColumns.length > 0) {
          return Promise.resolve(
            rows.map((r) => {
              const picked: Record<string, unknown> = {};
              for (const col of selectColumns) {
                picked[col] = r[col];
              }
              return picked;
            }),
          );
        }
        return Promise.resolve(rows);
      },
      update(data: Record<string, unknown>) {
        const rows = filterRows();
        for (const row of rows) {
          for (const [key, val] of Object.entries(data)) {
            (row as Record<string, unknown>)[key] = val;
          }
        }
        return {
          returning() {
            return Promise.resolve(rows);
          },
        };
      },
      del() {
        const matching = filterRows();
        const matchingIds = new Set(matching.map((r) => r.id));

        if (tableName === 'reports') {
          const before = reportRows.length;
          reportRows = reportRows.filter((r) => !matchingIds.has(r.id));
          return Promise.resolve(before - reportRows.length);
        }
        if (tableName === 'saved_charts') {
          const before = chartRows.length;
          chartRows = chartRows.filter((r) => !matchingIds.has(r.id));
          return Promise.resolve(before - chartRows.length);
        }
        return Promise.resolve(0);
      },
      limit(n: number) {
        limitCount = n;
        return builder;
      },
    };

    return builder;
  }

  const db = (tableName: string) => createBuilder(tableName);
  db.fn = { now: () => new Date().toISOString() };
  db.raw = (expr: string) => expr;

  return db;
}

// ── Helper: seed saved charts ──────────────────────────────────────

function seedCharts(storeId: string, count: number): void {
  for (let i = 0; i < count; i++) {
    chartRows.push({
      id: makeChartId(),
      store_id: storeId,
      title: `Chart ${i + 1}`,
      query_text: `Show chart ${i + 1}`,
      chart_config: JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [{ data: [i + 1] }] } }),
      position_index: i,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

// ── App builder ─────────────────────────────────────────────────────

async function buildApp(
  storeId: string = STORE_ID_A,
): Promise<{ app: FastifyInstance; fakeDb: ReturnType<typeof createFakeDb> }> {
  const fakeDb = createFakeDb();
  const pdfReportService = createPdfReportService({
    db: fakeDb as unknown as Parameters<typeof createPdfReportService>[0]['db'],
    chartRenderer: mockChartRenderer as unknown as Parameters<typeof createPdfReportService>[0]['chartRenderer'],
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
    reportRoutes(instance, { pdfReportService }),
  );

  await app.ready();
  return { app, fakeDb };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('PDF Reports Integration', () => {
  beforeEach(() => {
    reportRows = [];
    chartRows = [];
    nextReportId = 1;
    nextChartId = 1;
    mockChartRenderer.renderToBuffer.mockClear();
    mockChartRenderer.renderToBuffer.mockResolvedValue(Buffer.from('fake-png'));
    mockChartRenderer.renderToDataURI.mockClear();
  });

  // ── Full Generate + List + Download flow ─────────────────────────

  describe('full generate + list + download flow', () => {
    it('generates a report, lists it, and downloads the PDF', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 3);

      // Generate
      const genRes = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Monthly Revenue Report' },
      });

      expect(genRes.statusCode).toBe(201);
      const created = JSON.parse(genRes.body).data;
      expect(created.title).toBe('Monthly Revenue Report');
      expect(created.status).toBe('completed');
      expect(created.chartCount).toBe(3);
      const reportId = created.id;

      // List
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/reports',
      });

      expect(listRes.statusCode).toBe(200);
      const reports = JSON.parse(listRes.body).data.reports;
      expect(reports).toHaveLength(1);
      expect(reports[0].id).toBe(reportId);
      expect(reports[0].title).toBe('Monthly Revenue Report');

      // Download
      const dlRes = await app.inject({
        method: 'GET',
        url: `/api/reports/${reportId}/download`,
      });

      expect(dlRes.statusCode).toBe(200);
      expect(dlRes.headers['content-type']).toBe('application/pdf');
      expect(dlRes.headers['content-disposition']).toBe(
        `attachment; filename="report-${reportId}.pdf"`,
      );
      // Should return a valid buffer
      expect(dlRes.rawPayload.length).toBeGreaterThan(0);
    });

    it('generates a report and returns 201 with report metadata', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 2);

      const res = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Q4 Report' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.title).toBe('Q4 Report');
      expect(body.data.status).toBe('completed');
      expect(body.data.chartCount).toBe(2);
      expect(body.data.createdAt).toBeDefined();
    });

    it('list returns generated reports sorted by created_at desc', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      // Generate first report
      await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'First Report' },
      });

      // Generate second report
      await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Second Report' },
      });

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/reports',
      });

      const reports = JSON.parse(listRes.body).data.reports;
      expect(reports).toHaveLength(2);
      // Sorted desc by created_at, so second should be first
      expect(reports[0].title).toBe('Second Report');
      expect(reports[1].title).toBe('First Report');
    });

    it('download returns PDF buffer with correct length', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const genRes = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Download Test' },
      });

      const reportId = JSON.parse(genRes.body).data.id;

      const dlRes = await app.inject({
        method: 'GET',
        url: `/api/reports/${reportId}/download`,
      });

      expect(dlRes.statusCode).toBe(200);
      expect(dlRes.rawPayload).toBeInstanceOf(Buffer);
      expect(dlRes.rawPayload.length).toBeGreaterThan(0);
    });

    it('download has correct content-type header', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const genRes = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Header Test' },
      });

      const reportId = JSON.parse(genRes.body).data.id;

      const dlRes = await app.inject({
        method: 'GET',
        url: `/api/reports/${reportId}/download`,
      });

      expect(dlRes.headers['content-type']).toBe('application/pdf');
    });

    it('download has correct content-disposition header', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const genRes = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Disposition Test' },
      });

      const reportId = JSON.parse(genRes.body).data.id;

      const dlRes = await app.inject({
        method: 'GET',
        url: `/api/reports/${reportId}/download`,
      });

      expect(dlRes.headers['content-disposition']).toContain('attachment');
      expect(dlRes.headers['content-disposition']).toContain(`report-${reportId}.pdf`);
    });
  });

  // ── Chart rendering ──────────────────────────────────────────────

  describe('chart rendering during generation', () => {
    it('calls chartRenderer.renderToBuffer for each non-table chart', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 3);

      await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Render Test' },
      });

      expect(mockChartRenderer.renderToBuffer).toHaveBeenCalledTimes(3);
    });

    it('skips table-type charts in rendering', async () => {
      const { app } = await buildApp();

      // Add a bar chart and a table chart
      chartRows.push({
        id: makeChartId(),
        store_id: STORE_ID_A,
        title: 'Bar Chart',
        query_text: null,
        chart_config: JSON.stringify({ type: 'bar', data: {} }),
        position_index: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      chartRows.push({
        id: makeChartId(),
        store_id: STORE_ID_A,
        title: 'Table Data',
        query_text: null,
        chart_config: JSON.stringify({ type: 'table', data: {} }),
        position_index: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Mixed Charts' },
      });

      // Only the bar chart should be rendered, not the table
      expect(mockChartRenderer.renderToBuffer).toHaveBeenCalledTimes(1);
    });

    it('generates report with correct chart count including table charts', async () => {
      const { app } = await buildApp();

      chartRows.push({
        id: makeChartId(),
        store_id: STORE_ID_A,
        title: 'Bar Chart',
        query_text: null,
        chart_config: JSON.stringify({ type: 'bar', data: {} }),
        position_index: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      chartRows.push({
        id: makeChartId(),
        store_id: STORE_ID_A,
        title: 'Table Data',
        query_text: null,
        chart_config: JSON.stringify({ type: 'table', data: {} }),
        position_index: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Count Test' },
      });

      const body = JSON.parse(res.body);
      // chart_count should include all charts (bar + table)
      expect(body.data.chartCount).toBe(2);
    });
  });

  // ── Store isolation ──────────────────────────────────────────────

  describe('store isolation', () => {
    it('store A cannot download store B report', async () => {
      const { app: appA } = await buildApp(STORE_ID_A);
      const { app: appB } = await buildApp(STORE_ID_B);

      // Seed charts for store B
      seedCharts(STORE_ID_B, 2);

      // Store B generates a report
      const genRes = await appB.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Store B Report' },
      });

      const reportId = JSON.parse(genRes.body).data.id;

      // Store A tries to download store B's report
      const dlRes = await appA.inject({
        method: 'GET',
        url: `/api/reports/${reportId}/download`,
      });

      // Should be 404 (NotFoundError)
      expect(dlRes.statusCode).toBe(404);
    });

    it('store B list does not include store A reports', async () => {
      const { app: appA } = await buildApp(STORE_ID_A);
      const { app: appB } = await buildApp(STORE_ID_B);

      // Seed charts for both stores
      seedCharts(STORE_ID_A, 1);
      seedCharts(STORE_ID_B, 1);

      // Store A generates a report
      await appA.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Store A Report' },
      });

      // Store B generates a report
      await appB.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Store B Report' },
      });

      // Store B lists its reports
      const listB = await appB.inject({
        method: 'GET',
        url: '/api/reports',
      });

      const reportsB = JSON.parse(listB.body).data.reports;
      expect(reportsB).toHaveLength(1);
      expect(reportsB[0].title).toBe('Store B Report');

      // Store A lists its reports
      const listA = await appA.inject({
        method: 'GET',
        url: '/api/reports',
      });

      const reportsA = JSON.parse(listA.body).data.reports;
      expect(reportsA).toHaveLength(1);
      expect(reportsA[0].title).toBe('Store A Report');
    });

    it('store A cannot delete store B report', async () => {
      const { app: appA } = await buildApp(STORE_ID_A);
      const { app: appB } = await buildApp(STORE_ID_B);

      seedCharts(STORE_ID_B, 1);

      // Store B generates a report
      const genRes = await appB.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Store B Report' },
      });

      const reportId = JSON.parse(genRes.body).data.id;

      // Store A tries to delete it
      const deleteRes = await appA.inject({
        method: 'DELETE',
        url: `/api/reports/${reportId}`,
      });

      // Should be 404 (NotFoundError)
      expect(deleteRes.statusCode).toBe(404);

      // Verify report still exists for store B
      const listB = await appB.inject({
        method: 'GET',
        url: '/api/reports',
      });

      expect(JSON.parse(listB.body).data.reports).toHaveLength(1);
    });
  });

  // ── Validation ───────────────────────────────────────────────────

  describe('validation', () => {
    it('generate fails without title field', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const res = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
    });

    it('generate fails with empty string title', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const res = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: '' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('generate fails when no saved charts exist', async () => {
      const { app } = await buildApp();
      // No charts seeded

      const res = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Empty Dashboard Report' },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain('No saved charts');
    });

    it('generate fails with title exceeding 255 characters', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const longTitle = 'A'.repeat(256);
      const res = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: longTitle },
      });

      expect(res.statusCode).toBe(400);
    });

    it('download fails for non-existent report id', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/reports/non-existent-id/download',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('delete for non-existent report returns 404', async () => {
      const { app } = await buildApp();

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/reports/non-existent-id',
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── Delete ───────────────────────────────────────────────────────

  describe('delete', () => {
    it('delete removes a report successfully', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const genRes = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'To Be Deleted' },
      });

      const reportId = JSON.parse(genRes.body).data.id;

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/reports/${reportId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      const body = JSON.parse(deleteRes.body);
      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(true);
    });

    it('deleted report no longer appears in list', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      // Generate two reports
      const genRes1 = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Report One' },
      });
      const reportId1 = JSON.parse(genRes1.body).data.id;

      await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Report Two' },
      });

      // Delete the first one
      await app.inject({
        method: 'DELETE',
        url: `/api/reports/${reportId1}`,
      });

      // List should only contain the second report
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/reports',
      });

      const reports = JSON.parse(listRes.body).data.reports;
      expect(reports).toHaveLength(1);
      expect(reports[0].title).toBe('Report Two');
    });

    it('deleted report cannot be downloaded', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const genRes = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Gone Report' },
      });

      const reportId = JSON.parse(genRes.body).data.id;

      // Delete it
      await app.inject({
        method: 'DELETE',
        url: `/api/reports/${reportId}`,
      });

      // Try to download
      const dlRes = await app.inject({
        method: 'GET',
        url: `/api/reports/${reportId}/download`,
      });

      expect(dlRes.statusCode).toBe(404);
    });

    it('double delete returns 404', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const genRes = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Double Delete' },
      });

      const reportId = JSON.parse(genRes.body).data.id;

      // First delete succeeds
      const deleteRes1 = await app.inject({
        method: 'DELETE',
        url: `/api/reports/${reportId}`,
      });
      expect(deleteRes1.statusCode).toBe(200);

      // Second delete returns 404
      const deleteRes2 = await app.inject({
        method: 'DELETE',
        url: `/api/reports/${reportId}`,
      });
      expect(deleteRes2.statusCode).toBe(404);
    });
  });

  // ── Cleanup old reports ──────────────────────────────────────────

  describe('cleanup old reports', () => {
    it('old reports get cleaned up when exceeding 10', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      // Generate 11 reports (limit is MAX_REPORTS_PER_STORE = 10)
      for (let i = 0; i < 11; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/reports/generate',
          payload: { title: `Report ${i + 1}` },
        });
      }

      // List should show 10 (the oldest should have been removed)
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/reports',
      });

      const reports = JSON.parse(listRes.body).data.reports;
      expect(reports.length).toBeLessThanOrEqual(10);
    });

    it('cleanup removes only the oldest reports beyond limit', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      // Generate 12 reports
      for (let i = 0; i < 12; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/reports/generate',
          payload: { title: `Report ${i + 1}` },
        });
      }

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/reports',
      });

      const reports = JSON.parse(listRes.body).data.reports;
      expect(reports.length).toBeLessThanOrEqual(10);

      // The most recent report (Report 12) should still exist
      const titles = reports.map((r: { title: string }) => r.title);
      expect(titles).toContain('Report 12');
    });

    it('cleanup does not affect other store reports', async () => {
      const { app: appA } = await buildApp(STORE_ID_A);
      const { app: appB } = await buildApp(STORE_ID_B);

      seedCharts(STORE_ID_A, 1);
      seedCharts(STORE_ID_B, 1);

      // Store B generates 2 reports
      await appB.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Store B Report 1' },
      });
      await appB.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Store B Report 2' },
      });

      // Store A generates 11 reports (exceeds limit)
      for (let i = 0; i < 11; i++) {
        await appA.inject({
          method: 'POST',
          url: '/api/reports/generate',
          payload: { title: `Store A Report ${i + 1}` },
        });
      }

      // Store B reports should be unaffected
      const listB = await appB.inject({
        method: 'GET',
        url: '/api/reports',
      });

      const reportsB = JSON.parse(listB.body).data.reports;
      expect(reportsB).toHaveLength(2);
    });
  });

  // ── Empty list ───────────────────────────────────────────────────

  describe('empty state', () => {
    it('list returns empty array when no reports exist', async () => {
      const { app } = await buildApp();

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/reports',
      });

      expect(listRes.statusCode).toBe(200);
      const body = JSON.parse(listRes.body);
      expect(body.success).toBe(true);
      expect(body.data.reports).toEqual([]);
    });
  });

  // ── Multiple generates ───────────────────────────────────────────

  describe('multiple report generation', () => {
    it('each generate creates a distinct report with unique id', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 2);

      const genRes1 = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Report Alpha' },
      });

      const genRes2 = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: 'Report Beta' },
      });

      const id1 = JSON.parse(genRes1.body).data.id;
      const id2 = JSON.parse(genRes2.body).data.id;

      expect(id1).not.toBe(id2);

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/reports',
      });

      const reports = JSON.parse(listRes.body).data.reports;
      expect(reports).toHaveLength(2);
    });

    it('generate trims whitespace from title', async () => {
      const { app } = await buildApp();
      seedCharts(STORE_ID_A, 1);

      const res = await app.inject({
        method: 'POST',
        url: '/api/reports/generate',
        payload: { title: '  Trimmed Title  ' },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.data.title).toBe('Trimmed Title');
    });
  });
});
