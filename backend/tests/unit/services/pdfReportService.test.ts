import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Mock pdfkit ─────────────────────────────────────────────────────

const mockPdfEnd = jest.fn();
const mockPdfOn = jest.fn();
const mockPdfFontSize = jest.fn();
const mockPdfText = jest.fn();
const mockPdfMoveDown = jest.fn();
const mockPdfFillColor = jest.fn();
const mockPdfMoveTo = jest.fn();
const mockPdfLineTo = jest.fn();
const mockPdfStroke = jest.fn();
const mockPdfImage = jest.fn();
const mockPdfAddPage = jest.fn();

class MockPDFDocument {
  y = 100;
  private handlers: Record<string, (arg: unknown) => void> = {};

  on(event: string, handler: (arg: unknown) => void) {
    mockPdfOn(event, handler);
    this.handlers[event] = handler;
    return this;
  }

  fontSize(_size: number) {
    mockPdfFontSize(_size);
    return this;
  }

  text(str: string, opts?: Record<string, unknown>) {
    mockPdfText(str, opts);
    return this;
  }

  moveDown(_lines?: number) {
    mockPdfMoveDown(_lines);
    return this;
  }

  fillColor(color: string) {
    mockPdfFillColor(color);
    return this;
  }

  moveTo(_x: number, _y: number) {
    mockPdfMoveTo(_x, _y);
    return this;
  }

  lineTo(_x: number, _y: number) {
    mockPdfLineTo(_x, _y);
    return this;
  }

  stroke(_color?: string) {
    mockPdfStroke(_color);
    return this;
  }

  image(_buf: Buffer, _opts?: Record<string, unknown>) {
    mockPdfImage(_buf, _opts);
    return this;
  }

  addPage() {
    mockPdfAddPage();
    return this;
  }

  end() {
    mockPdfEnd();
    // Emit data then end events asynchronously so the Promise resolves
    const pdfChunk = Buffer.from('mock-pdf-content');
    if (this.handlers['data']) {
      this.handlers['data'](pdfChunk);
    }
    if (this.handlers['end']) {
      this.handlers['end'](undefined);
    }
  }
}

jest.unstable_mockModule('pdfkit', () => ({
  default: MockPDFDocument,
}));

// ── Import module under test (after all mocks) ─────────────────────

const { createPdfReportService } = await import('../../../src/services/pdfReportService.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const REPORT_ID = 'rpt-0001-0001-0001-000000000001';

function makeReportRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    store_id: STORE_ID,
    title: 'Monthly Revenue Report',
    status: 'completed',
    chart_count: 2,
    file_data: Buffer.from('mock-pdf-content').toString('base64'),
    created_at: '2026-02-12T00:00:00Z',
    ...overrides,
  };
}

function makeChartRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chart-001',
    store_id: STORE_ID,
    title: 'Revenue by Product',
    chart_config: JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [] } }),
    position_index: 0,
    ...overrides,
  };
}

interface MockQueryBuilder {
  where: jest.Mock<() => MockQueryBuilder>;
  count: jest.Mock<() => MockQueryBuilder>;
  max: jest.Mock<() => MockQueryBuilder>;
  insert: jest.Mock<() => MockQueryBuilder>;
  returning: jest.Mock<() => Promise<unknown[]>>;
  orderBy: jest.Mock<() => MockQueryBuilder>;
  select: jest.Mock<() => Promise<unknown[]>>;
  first: jest.Mock<() => Promise<unknown>>;
  update: jest.Mock<() => MockQueryBuilder>;
  del: jest.Mock<() => Promise<number>>;
  limit: jest.Mock<() => MockQueryBuilder>;
  andWhere: jest.Mock<() => MockQueryBuilder>;
  whereIn: jest.Mock<() => MockQueryBuilder>;
}

function createMockDb() {
  const builder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis() as MockQueryBuilder['where'],
    count: jest.fn().mockReturnThis() as MockQueryBuilder['count'],
    max: jest.fn().mockReturnThis() as MockQueryBuilder['max'],
    insert: jest.fn().mockReturnThis() as MockQueryBuilder['insert'],
    returning: jest.fn() as MockQueryBuilder['returning'],
    orderBy: jest.fn().mockReturnThis() as MockQueryBuilder['orderBy'],
    select: jest.fn() as MockQueryBuilder['select'],
    first: jest.fn() as MockQueryBuilder['first'],
    update: jest.fn().mockReturnThis() as MockQueryBuilder['update'],
    del: jest.fn() as MockQueryBuilder['del'],
    limit: jest.fn().mockReturnThis() as MockQueryBuilder['limit'],
    andWhere: jest.fn().mockReturnThis() as MockQueryBuilder['andWhere'],
    whereIn: jest.fn().mockReturnThis() as MockQueryBuilder['whereIn'],
  };

  const db = jest.fn().mockReturnValue(builder);
  return { db, builder };
}

function createMockChartRenderer() {
  return {
    renderToBuffer: jest.fn<() => Promise<Buffer | null>>().mockResolvedValue(Buffer.from('png-data')),
    renderToDataURI: jest.fn<() => Promise<string | null>>().mockResolvedValue('data:image/png;base64,abc'),
  };
}

type ServiceDeps = Parameters<typeof createPdfReportService>[0];

// ── Tests ───────────────────────────────────────────────────────────

describe('pdfReportService', () => {
  let db: ReturnType<typeof createMockDb>['db'];
  let builder: MockQueryBuilder;
  let chartRenderer: ReturnType<typeof createMockChartRenderer>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMockDb();
    db = mocks.db;
    builder = mocks.builder;
    chartRenderer = createMockChartRenderer();

    // Reset mock PDF document y position
    mockPdfEnd.mockClear();
    mockPdfOn.mockClear();
    mockPdfFontSize.mockClear();
    mockPdfText.mockClear();
    mockPdfMoveDown.mockClear();
    mockPdfFillColor.mockClear();
    mockPdfMoveTo.mockClear();
    mockPdfLineTo.mockClear();
    mockPdfStroke.mockClear();
    mockPdfImage.mockClear();
    mockPdfAddPage.mockClear();
  });

  // ── generateReport ───────────────────────────────────────────────

  describe('generateReport()', () => {
    it('throws ValidationError when title is empty', async () => {
      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(service.generateReport(STORE_ID, '')).rejects.toThrow('Title is required');
    });

    it('throws ValidationError when title is not a string', async () => {
      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.generateReport(STORE_ID, 123 as unknown as string),
      ).rejects.toThrow('Title is required');
    });

    it('throws ValidationError when title is whitespace-only', async () => {
      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(service.generateReport(STORE_ID, '   ')).rejects.toThrow('Title is required');
    });

    it('throws ValidationError when title exceeds 255 chars', async () => {
      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.generateReport(STORE_ID, 'a'.repeat(256)),
      ).rejects.toThrow('Title must not exceed 255 characters');
    });

    it('throws ValidationError when no saved charts exist', async () => {
      // saved_charts query returns empty array
      builder.select.mockResolvedValueOnce([]);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.generateReport(STORE_ID, 'My Report'),
      ).rejects.toThrow('No saved charts to export');
    });

    it('generates report with correct chart count', async () => {
      const charts = [
        makeChartRecord({ id: 'c1', title: 'Chart 1', position_index: 0 }),
        makeChartRecord({ id: 'c2', title: 'Chart 2', position_index: 1 }),
        makeChartRecord({ id: 'c3', title: 'Chart 3', position_index: 2 }),
      ];

      // select saved_charts
      builder.select.mockResolvedValueOnce(charts);
      // insert into reports → returning
      const insertedRecord = makeReportRecord({ status: 'generating', chart_count: 3 });
      builder.returning.mockResolvedValueOnce([insertedRecord]);
      // update reports → returning (completed)
      const updatedRecord = makeReportRecord({ status: 'completed', chart_count: 3 });
      builder.returning.mockResolvedValueOnce([updatedRecord]);
      // cleanup: count
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      const result = await service.generateReport(STORE_ID, 'My Report');

      expect(result.chartCount).toBe(3);
    });

    it('stores PDF as base64 in reports table', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, 'My Report');

      // The update call should include file_data as base64
      expect(builder.update).toHaveBeenCalled();
      const updateArgs = (builder.update.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      expect(updateArgs.status).toBe('completed');
      expect(typeof updateArgs.file_data).toBe('string');
      // Verify it's valid base64 by decoding
      const decoded = Buffer.from(updateArgs.file_data as string, 'base64');
      expect(decoded.length).toBeGreaterThan(0);
    });

    it('sets status to completed on success', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      const result = await service.generateReport(STORE_ID, 'My Report');

      expect(result.status).toBe('completed');
      // Verify the update was called with status 'completed'
      const updateArgs = (builder.update.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      expect(updateArgs.status).toBe('completed');
    });

    it('sets status to failed on chart render error', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ id: REPORT_ID, status: 'generating', chart_count: 1 })]);

      // chartRenderer throws an error
      chartRenderer.renderToBuffer.mockRejectedValueOnce(new Error('Canvas render failed'));

      // update for failure (no returning needed, just update)
      // The catch block calls update without returning

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.generateReport(STORE_ID, 'My Report'),
      ).rejects.toThrow('Canvas render failed');

      // Verify that the catch block called update with status: 'failed'
      const updateArgs = (builder.update.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      expect(updateArgs.status).toBe('failed');
    });

    it('calls chartRenderer.renderToBuffer for each chart', async () => {
      const charts = [
        makeChartRecord({ id: 'c1', title: 'Chart 1', chart_config: JSON.stringify({ type: 'bar', data: {} }) }),
        makeChartRecord({ id: 'c2', title: 'Chart 2', chart_config: JSON.stringify({ type: 'line', data: {} }) }),
      ];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 2 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 2 })]);
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, 'My Report');

      expect(chartRenderer.renderToBuffer).toHaveBeenCalledTimes(2);
      const call0 = (chartRenderer.renderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      expect(call0.type).toBe('bar');
      const call1 = (chartRenderer.renderToBuffer.mock.calls as unknown[][])[1][0] as Record<string, unknown>;
      expect(call1.type).toBe('line');
    });

    it('skips table-type charts (buffer is null but chart still counted)', async () => {
      const charts = [
        makeChartRecord({ id: 'c1', title: 'Table Data', chart_config: JSON.stringify({ type: 'table', data: {} }) }),
        makeChartRecord({ id: 'c2', title: 'Bar Chart', chart_config: JSON.stringify({ type: 'bar', data: {} }) }),
      ];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 2 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 2 })]);
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      const result = await service.generateReport(STORE_ID, 'My Report');

      // renderToBuffer should only be called for the bar chart, not the table
      expect(chartRenderer.renderToBuffer).toHaveBeenCalledTimes(1);
      const call0 = (chartRenderer.renderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      expect(call0.type).toBe('bar');
      // But the chart count includes both
      expect(result.chartCount).toBe(2);
    });

    it('cleans up old reports when exceeding 10', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);

      // cleanup: count returns 12 (exceeds 10)
      builder.first.mockResolvedValueOnce({ count: '12' });
      // cleanup: select oldest 2
      builder.select.mockResolvedValueOnce([{ id: 'old-1' }, { id: 'old-2' }]);
      // cleanup: del
      builder.del.mockResolvedValueOnce(2);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, 'My Report');

      // Verify whereIn was called with the old report ids
      expect(builder.whereIn).toHaveBeenCalledWith('id', ['old-1', 'old-2']);
      expect(builder.del).toHaveBeenCalled();
    });

    it('parses string chart_config as JSON', async () => {
      const chartConfig = { type: 'pie', data: { labels: ['X', 'Y'] } };
      const charts = [
        makeChartRecord({ chart_config: JSON.stringify(chartConfig) }),
      ];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, 'My Report');

      const renderedConfig = (chartRenderer.renderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      expect(renderedConfig).toEqual(chartConfig);
    });

    it('handles already-parsed chart_config objects', async () => {
      const chartConfig = { type: 'doughnut', data: { labels: ['A'] } };
      const charts = [
        makeChartRecord({ chart_config: chartConfig }), // already an object, not string
      ];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, 'My Report');

      const renderedConfig = (chartRenderer.renderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      expect(renderedConfig).toEqual(chartConfig);
    });

    it('trims title whitespace before storing', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, '  Trimmed Title  ');

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Trimmed Title' }),
      );
    });

    it('inserts report with status generating and correct store_id', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, 'My Report');

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          store_id: STORE_ID,
          status: 'generating',
          chart_count: 1,
        }),
      );
    });

    it('returns mapped response with correct fields', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      const completedRecord = makeReportRecord({
        id: 'rpt-xyz',
        title: 'Final Report',
        status: 'completed',
        chart_count: 1,
        created_at: '2026-02-12T10:30:00Z',
      });
      builder.returning.mockResolvedValueOnce([completedRecord]);
      builder.first.mockResolvedValueOnce({ count: '1' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      const result = await service.generateReport(STORE_ID, 'Final Report');

      expect(result).toEqual({
        id: 'rpt-xyz',
        title: 'Final Report',
        status: 'completed',
        chartCount: 1,
        createdAt: '2026-02-12T10:30:00Z',
      });
    });
  });

  // ── listReports ──────────────────────────────────────────────────

  describe('listReports()', () => {
    it('returns empty array when no reports exist', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      const result = await service.listReports(STORE_ID);

      expect(result).toEqual([]);
    });

    it('returns reports ordered by created_at desc', async () => {
      builder.select.mockResolvedValueOnce([
        makeReportRecord({ id: 'rpt-1', title: 'Report 1', created_at: '2026-02-12T10:00:00Z' }),
        makeReportRecord({ id: 'rpt-2', title: 'Report 2', created_at: '2026-02-11T10:00:00Z' }),
      ]);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      const result = await service.listReports(STORE_ID);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('rpt-1');
      expect(result[1].id).toBe('rpt-2');
      expect(builder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('maps DB records to response format correctly', async () => {
      builder.select.mockResolvedValueOnce([
        makeReportRecord({
          id: 'rpt-abc',
          title: 'Sales Report',
          status: 'completed',
          chart_count: 5,
          created_at: '2026-02-12T08:15:00Z',
        }),
      ]);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      const result = await service.listReports(STORE_ID);

      expect(result[0]).toEqual({
        id: 'rpt-abc',
        title: 'Sales Report',
        status: 'completed',
        chartCount: 5,
        createdAt: '2026-02-12T08:15:00Z',
      });
    });

    it('filters by store_id', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.listReports(STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: STORE_ID });
    });

    it('selects specific columns', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.listReports(STORE_ID);

      expect(builder.select).toHaveBeenCalledWith(
        'id', 'store_id', 'title', 'status', 'chart_count', 'created_at',
      );
    });
  });

  // ── getReportFile ────────────────────────────────────────────────

  describe('getReportFile()', () => {
    it('throws NotFoundError when report does not exist', async () => {
      builder.first.mockResolvedValueOnce(undefined);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.getReportFile(STORE_ID, 'nonexistent'),
      ).rejects.toThrow('Report not found');
    });

    it('throws ValidationError when report status is not completed', async () => {
      builder.first.mockResolvedValueOnce(
        makeReportRecord({ status: 'generating' }),
      );

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.getReportFile(STORE_ID, REPORT_ID),
      ).rejects.toThrow('Report is not ready for download');
    });

    it('throws ValidationError when report status is failed', async () => {
      builder.first.mockResolvedValueOnce(
        makeReportRecord({ status: 'failed' }),
      );

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.getReportFile(STORE_ID, REPORT_ID),
      ).rejects.toThrow('Report is not ready for download');
    });

    it('throws NotFoundError when file_data is null', async () => {
      builder.first.mockResolvedValueOnce(
        makeReportRecord({ status: 'completed', file_data: null }),
      );

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.getReportFile(STORE_ID, REPORT_ID),
      ).rejects.toThrow('Report file data not found');
    });

    it('returns Buffer from base64 file_data', async () => {
      const originalContent = 'pdf-binary-content-here';
      const base64Data = Buffer.from(originalContent).toString('base64');
      builder.first.mockResolvedValueOnce(
        makeReportRecord({ status: 'completed', file_data: base64Data }),
      );

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      const result = await service.getReportFile(STORE_ID, REPORT_ID);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe(originalContent);
    });

    it('filters by both id and store_id', async () => {
      builder.first.mockResolvedValueOnce(makeReportRecord());

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.getReportFile(STORE_ID, REPORT_ID);

      expect(builder.where).toHaveBeenCalledWith({ id: REPORT_ID, store_id: STORE_ID });
    });
  });

  // ── deleteReport ─────────────────────────────────────────────────

  describe('deleteReport()', () => {
    it('throws NotFoundError when report does not exist', async () => {
      builder.del.mockResolvedValueOnce(0);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.deleteReport(STORE_ID, 'nonexistent'),
      ).rejects.toThrow('Report not found');
    });

    it('deletes report successfully', async () => {
      builder.del.mockResolvedValueOnce(1);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await expect(
        service.deleteReport(STORE_ID, REPORT_ID),
      ).resolves.toBeUndefined();

      expect(builder.where).toHaveBeenCalledWith({ id: REPORT_ID, store_id: STORE_ID });
      expect(builder.del).toHaveBeenCalled();
    });

    it('logs successful deletion', async () => {
      builder.del.mockResolvedValueOnce(1);

      const { logger: mockLogger } = await import('../../../src/utils/logger.js');

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.deleteReport(STORE_ID, REPORT_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        { storeId: STORE_ID, reportId: REPORT_ID },
        'Report deleted',
      );
    });
  });

  // ── cleanupOldReports (tested via generateReport) ────────────────

  describe('cleanupOldReports (via generateReport)', () => {
    it('does not delete when under 10 reports', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);

      // cleanup: count returns 5 (under the limit)
      builder.first.mockResolvedValueOnce({ count: '5' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, 'Report');

      // whereIn should NOT have been called (no cleanup needed)
      expect(builder.whereIn).not.toHaveBeenCalled();
    });

    it('does not delete when exactly at 10 reports', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);

      // cleanup: count returns exactly 10
      builder.first.mockResolvedValueOnce({ count: '10' });

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, 'Report');

      expect(builder.whereIn).not.toHaveBeenCalled();
    });

    it('deletes oldest when exceeding 10 reports', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);

      // cleanup: count returns 13 (3 over limit)
      builder.first.mockResolvedValueOnce({ count: '13' });
      // cleanup: select oldest 3
      builder.select.mockResolvedValueOnce([
        { id: 'old-1' },
        { id: 'old-2' },
        { id: 'old-3' },
      ]);
      // cleanup: del
      builder.del.mockResolvedValueOnce(3);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      await service.generateReport(STORE_ID, 'Report');

      // limit(3) for the 3 over the limit
      expect(builder.limit).toHaveBeenCalledWith(3);
      expect(builder.whereIn).toHaveBeenCalledWith('id', ['old-1', 'old-2', 'old-3']);
      expect(builder.andWhere).toHaveBeenCalledWith({ store_id: STORE_ID });
      expect(builder.del).toHaveBeenCalled();
    });

    it('handles count result with null count gracefully', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'generating', chart_count: 1 })]);
      builder.returning.mockResolvedValueOnce([makeReportRecord({ status: 'completed', chart_count: 1 })]);

      // cleanup: count returns undefined (edge case)
      builder.first.mockResolvedValueOnce(undefined);

      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      // Should not throw — gracefully defaults to 0, which is under limit
      await expect(
        service.generateReport(STORE_ID, 'Report'),
      ).resolves.toBeDefined();

      expect(builder.whereIn).not.toHaveBeenCalled();
    });
  });

  // ── Factory ──────────────────────────────────────────────────────

  describe('createPdfReportService factory', () => {
    it('returns object with all expected methods', () => {
      const service = createPdfReportService({
        db: db as unknown as ServiceDeps['db'],
        chartRenderer: chartRenderer as unknown as ServiceDeps['chartRenderer'],
      });

      expect(service).toHaveProperty('generateReport');
      expect(service).toHaveProperty('listReports');
      expect(service).toHaveProperty('getReportFile');
      expect(service).toHaveProperty('deleteReport');
      expect(typeof service.generateReport).toBe('function');
      expect(typeof service.listReports).toBe('function');
      expect(typeof service.getReportFile).toBe('function');
      expect(typeof service.deleteReport).toBe('function');
    });
  });
});
