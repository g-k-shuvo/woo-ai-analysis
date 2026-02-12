import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Import module under test (after all mocks) ─────────────────────

const { createCsvExportService } = await import('../../../src/services/csvExportService.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHART_ID = 'chart-0001-0001-0001-000000000001';
const UTF8_BOM = '\uFEFF';

function makeChartRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: CHART_ID,
    store_id: STORE_ID,
    title: 'Revenue by Product',
    chart_config: JSON.stringify({
      type: 'bar',
      data: {
        labels: ['Widget A', 'Widget B', 'Widget C'],
        datasets: [
          { label: 'Revenue', data: [1000, 2000, 3000] },
        ],
      },
    }),
    position_index: 0,
    ...overrides,
  };
}

interface MockQueryBuilder {
  where: jest.Mock<() => MockQueryBuilder>;
  orderBy: jest.Mock<() => MockQueryBuilder>;
  select: jest.Mock<() => Promise<unknown[]>>;
  first: jest.Mock<() => Promise<unknown>>;
}

function createMockDb() {
  const builder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis() as MockQueryBuilder['where'],
    orderBy: jest.fn().mockReturnThis() as MockQueryBuilder['orderBy'],
    select: jest.fn() as MockQueryBuilder['select'],
    first: jest.fn() as MockQueryBuilder['first'],
  };

  const db = jest.fn().mockReturnValue(builder);
  return { db, builder };
}

type ServiceDeps = Parameters<typeof createCsvExportService>[0];

// ── Tests ───────────────────────────────────────────────────────────

describe('csvExportService', () => {
  let db: ReturnType<typeof createMockDb>['db'];
  let builder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMockDb();
    db = mocks.db;
    builder = mocks.builder;
  });

  // ── exportCsv (all charts) ──────────────────────────────────────

  describe('exportCsv() — all charts', () => {
    it('throws ValidationError when no saved charts exist', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(service.exportCsv(STORE_ID)).rejects.toThrow(
        'No saved charts to export',
      );
    });

    it('generates CSV with UTF-8 BOM', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);

      expect(result.startsWith(UTF8_BOM)).toBe(true);
    });

    it('includes chart title as section header', async () => {
      const charts = [makeChartRecord({ title: 'My Revenue Chart' })];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);

      // First line after BOM should be the chart title
      const content = result.substring(UTF8_BOM.length);
      expect(content.startsWith('My Revenue Chart')).toBe(true);
    });

    it('generates correct CSV structure with headers and data', async () => {
      const charts = [
        makeChartRecord({
          chart_config: JSON.stringify({
            type: 'bar',
            data: {
              labels: ['Jan', 'Feb'],
              datasets: [{ label: 'Sales', data: [100, 200] }],
            },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);
      const lines = result.substring(UTF8_BOM.length).split('\r\n');

      // Line 0: chart title
      expect(lines[0]).toBe('Revenue by Product');
      // Line 1: header row
      expect(lines[1]).toBe('Label,Sales');
      // Line 2-3: data rows
      expect(lines[2]).toBe('Jan,100');
      expect(lines[3]).toBe('Feb,200');
    });

    it('separates multiple charts with blank line', async () => {
      const charts = [
        makeChartRecord({
          id: 'c1',
          title: 'Chart 1',
          position_index: 0,
          chart_config: JSON.stringify({
            type: 'bar',
            data: { labels: ['A'], datasets: [{ label: 'Val', data: [10] }] },
          }),
        }),
        makeChartRecord({
          id: 'c2',
          title: 'Chart 2',
          position_index: 1,
          chart_config: JSON.stringify({
            type: 'line',
            data: { labels: ['B'], datasets: [{ label: 'Val', data: [20] }] },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);
      const content = result.substring(UTF8_BOM.length);

      // Should contain double CRLF between sections
      expect(content).toContain('\r\n\r\n');
      expect(content).toContain('Chart 1');
      expect(content).toContain('Chart 2');
    });

    it('handles multiple datasets per chart', async () => {
      const charts = [
        makeChartRecord({
          chart_config: JSON.stringify({
            type: 'bar',
            data: {
              labels: ['Jan', 'Feb'],
              datasets: [
                { label: 'Revenue', data: [1000, 2000] },
                { label: 'Profit', data: [300, 500] },
              ],
            },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);
      const lines = result.substring(UTF8_BOM.length).split('\r\n');

      // Header should include both dataset labels
      expect(lines[1]).toBe('Label,Revenue,Profit');
      expect(lines[2]).toBe('Jan,1000,300');
      expect(lines[3]).toBe('Feb,2000,500');
    });

    it('skips charts with no exportable data', async () => {
      const charts = [
        makeChartRecord({
          id: 'c1',
          title: 'Empty Chart',
          position_index: 0,
          chart_config: JSON.stringify({ type: 'bar', data: { labels: [], datasets: [] } }),
        }),
        makeChartRecord({
          id: 'c2',
          title: 'Valid Chart',
          position_index: 1,
          chart_config: JSON.stringify({
            type: 'line',
            data: { labels: ['X'], datasets: [{ label: 'Y', data: [5] }] },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);
      const content = result.substring(UTF8_BOM.length);

      expect(content).toContain('Valid Chart');
      expect(content).not.toContain('Empty Chart');
    });

    it('throws when all charts have no exportable data', async () => {
      const charts = [
        makeChartRecord({
          chart_config: JSON.stringify({ type: 'bar', data: { labels: [], datasets: [] } }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(service.exportCsv(STORE_ID)).rejects.toThrow(
        'No charts with exportable data found',
      );
    });

    it('filters by store_id', async () => {
      builder.select.mockResolvedValueOnce([makeChartRecord()]);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.exportCsv(STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: STORE_ID });
    });

    it('orders by position_index asc', async () => {
      builder.select.mockResolvedValueOnce([makeChartRecord()]);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.exportCsv(STORE_ID);

      expect(builder.orderBy).toHaveBeenCalledWith('position_index', 'asc');
    });

    it('handles chart_config stored as object (not string)', async () => {
      const charts = [
        makeChartRecord({
          chart_config: {
            type: 'pie',
            data: { labels: ['Slice'], datasets: [{ label: 'Amount', data: [42] }] },
          },
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);
      const content = result.substring(UTF8_BOM.length);

      expect(content).toContain('Slice,42');
    });

    it('handles invalid JSON in chart_config gracefully (skips chart)', async () => {
      const charts = [
        makeChartRecord({
          id: 'bad',
          title: 'Bad Config',
          chart_config: '{invalid json',
        }),
        makeChartRecord({
          id: 'good',
          title: 'Good Config',
          chart_config: JSON.stringify({
            type: 'bar',
            data: { labels: ['A'], datasets: [{ label: 'V', data: [1] }] },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);
      const content = result.substring(UTF8_BOM.length);

      expect(content).toContain('Good Config');
      expect(content).not.toContain('Bad Config');
    });

    it('escapes CSV values containing commas', async () => {
      const charts = [
        makeChartRecord({
          chart_config: JSON.stringify({
            type: 'bar',
            data: {
              labels: ['Widget A, Premium'],
              datasets: [{ label: 'Revenue', data: [1000] }],
            },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);

      expect(result).toContain('"Widget A, Premium"');
    });

    it('escapes CSV values containing double quotes', async () => {
      const charts = [
        makeChartRecord({
          chart_config: JSON.stringify({
            type: 'bar',
            data: {
              labels: ['Widget "Pro"'],
              datasets: [{ label: 'Revenue', data: [500] }],
            },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);

      expect(result).toContain('"Widget ""Pro"""');
    });

    it('escapes CSV values containing newlines', async () => {
      const charts = [
        makeChartRecord({
          chart_config: JSON.stringify({
            type: 'bar',
            data: {
              labels: ['Line 1\nLine 2'],
              datasets: [{ label: 'Val', data: [10] }],
            },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);

      expect(result).toContain('"Line 1\nLine 2"');
    });

    it('uses default label when dataset label is missing', async () => {
      const charts = [
        makeChartRecord({
          chart_config: JSON.stringify({
            type: 'bar',
            data: {
              labels: ['A'],
              datasets: [{ data: [100] }],
            },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);
      const lines = result.substring(UTF8_BOM.length).split('\r\n');

      expect(lines[1]).toBe('Label,Value');
    });

    it('handles null and undefined values in data arrays', async () => {
      const charts = [
        makeChartRecord({
          chart_config: JSON.stringify({
            type: 'bar',
            data: {
              labels: ['A', 'B'],
              datasets: [{ label: 'Val', data: [null, undefined] }],
            },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);
      const lines = result.substring(UTF8_BOM.length).split('\r\n');

      // null/undefined should produce empty values
      expect(lines[2]).toBe('A,');
      expect(lines[3]).toBe('B,');
    });

    it('handles chart_config with no data property', async () => {
      const charts = [
        makeChartRecord({
          id: 'no-data',
          title: 'No Data',
          chart_config: JSON.stringify({ type: 'bar' }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(service.exportCsv(STORE_ID)).rejects.toThrow(
        'No charts with exportable data found',
      );
    });

    it('handles dataset with more data points than labels', async () => {
      const charts = [
        makeChartRecord({
          chart_config: JSON.stringify({
            type: 'bar',
            data: {
              labels: ['A'],
              datasets: [{ label: 'Val', data: [1, 2, 3] }],
            },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);
      const lines = result.substring(UTF8_BOM.length).split('\r\n');

      // Should have 3 data rows (max of labels and data lengths)
      expect(lines[2]).toBe('A,1');
      expect(lines[3]).toBe(',2');
      expect(lines[4]).toBe(',3');
    });

    it('logs export info on success', async () => {
      const charts = [makeChartRecord()];
      builder.select.mockResolvedValueOnce(charts);

      const { logger: mockLogger } = await import('../../../src/utils/logger.js');

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.exportCsv(STORE_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: STORE_ID, chartCount: 1 }),
        'CSV exported for all charts',
      );
    });

    it('escapes chart titles containing commas', async () => {
      const charts = [
        makeChartRecord({
          title: 'Revenue, Q1 2026',
          chart_config: JSON.stringify({
            type: 'bar',
            data: { labels: ['A'], datasets: [{ label: 'V', data: [1] }] },
          }),
        }),
      ];
      builder.select.mockResolvedValueOnce(charts);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID);

      expect(result).toContain('"Revenue, Q1 2026"');
    });
  });

  // ── exportCsv (single chart) ──────────────────────────────────────

  describe('exportCsv() — single chart', () => {
    it('throws NotFoundError when chart does not exist', async () => {
      builder.first.mockResolvedValueOnce(undefined);

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.exportCsv(STORE_ID, 'nonexistent'),
      ).rejects.toThrow('Chart not found');
    });

    it('throws ValidationError when chart has no exportable data', async () => {
      builder.first.mockResolvedValueOnce(
        makeChartRecord({
          chart_config: JSON.stringify({ type: 'bar', data: { labels: [], datasets: [] } }),
        }),
      );

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.exportCsv(STORE_ID, CHART_ID),
      ).rejects.toThrow('Chart has no exportable data');
    });

    it('generates CSV for single chart with BOM', async () => {
      builder.first.mockResolvedValueOnce(makeChartRecord());

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID, CHART_ID);

      expect(result.startsWith(UTF8_BOM)).toBe(true);
    });

    it('generates correct CSV for single chart', async () => {
      builder.first.mockResolvedValueOnce(
        makeChartRecord({
          chart_config: JSON.stringify({
            type: 'bar',
            data: {
              labels: ['Jan', 'Feb', 'Mar'],
              datasets: [{ label: 'Sales', data: [100, 200, 300] }],
            },
          }),
        }),
      );

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID, CHART_ID);
      const lines = result.substring(UTF8_BOM.length).split('\r\n');

      expect(lines[0]).toBe('Label,Sales');
      expect(lines[1]).toBe('Jan,100');
      expect(lines[2]).toBe('Feb,200');
      expect(lines[3]).toBe('Mar,300');
    });

    it('does not include chart title in single chart export', async () => {
      builder.first.mockResolvedValueOnce(
        makeChartRecord({ title: 'My Chart Title' }),
      );

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID, CHART_ID);
      const content = result.substring(UTF8_BOM.length);

      // Single chart export should NOT have the title as a row
      expect(content.startsWith('Label,')).toBe(true);
    });

    it('filters by both id and store_id', async () => {
      builder.first.mockResolvedValueOnce(makeChartRecord());

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.exportCsv(STORE_ID, CHART_ID);

      expect(builder.where).toHaveBeenCalledWith({
        id: CHART_ID,
        store_id: STORE_ID,
      });
    });

    it('throws ValidationError for overly long chart ID', async () => {
      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.exportCsv(STORE_ID, 'a'.repeat(256)),
      ).rejects.toThrow('Invalid chart ID');
    });

    it('handles object chart_config (not string)', async () => {
      builder.first.mockResolvedValueOnce(
        makeChartRecord({
          chart_config: {
            type: 'pie',
            data: {
              labels: ['Slice A'],
              datasets: [{ label: 'Amount', data: [42] }],
            },
          },
        }),
      );

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.exportCsv(STORE_ID, CHART_ID);
      const content = result.substring(UTF8_BOM.length);

      expect(content).toContain('Slice A,42');
    });

    it('logs export info on success', async () => {
      builder.first.mockResolvedValueOnce(makeChartRecord());

      const { logger: mockLogger } = await import('../../../src/utils/logger.js');

      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.exportCsv(STORE_ID, CHART_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: STORE_ID, chartId: CHART_ID }),
        'CSV exported for single chart',
      );
    });
  });

  // ── Factory ──────────────────────────────────────────────────────

  describe('createCsvExportService factory', () => {
    it('returns object with exportCsv method', () => {
      const service = createCsvExportService({
        db: db as unknown as ServiceDeps['db'],
      });

      expect(service).toHaveProperty('exportCsv');
      expect(typeof service.exportCsv).toBe('function');
    });
  });
});
