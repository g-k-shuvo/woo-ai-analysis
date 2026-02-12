import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type {
  ChartConfiguration,
  ChartMeta,
  TableResult,
  ChartSpecResult,
} from '../../../src/ai/types.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { convertChartType } = await import('../../../src/ai/chartTypeConverter.js');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ──────────────────────────────────────────────────────────

function makeMeta(overrides: Partial<ChartMeta & { title: string }> = {}): ChartMeta & { title: string } {
  return {
    title: 'Revenue by Product',
    dataKey: 'revenue',
    labelKey: 'name',
    xLabel: 'Product',
    yLabel: 'Revenue ($)',
    ...overrides,
  };
}

function makeRows(count = 3): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Product ${i + 1}`,
    revenue: (i + 1) * 100,
  }));
}

function makeBarConfig(): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: ['Product 1', 'Product 2', 'Product 3'],
      datasets: [{
        label: 'Revenue by Product',
        data: [100, 200, 300],
        backgroundColor: ['rgba(54, 162, 235, 0.7)', 'rgba(255, 99, 132, 0.7)', 'rgba(75, 192, 192, 0.7)'],
        borderColor: ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)'],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Revenue by Product' },
      },
      scales: {
        x: { title: { display: true, text: 'Product' } },
        y: { title: { display: true, text: 'Revenue ($)' } },
      },
    },
  };
}

function makeLineConfig(): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar'],
      datasets: [{
        label: 'Monthly Revenue',
        data: [1000, 1500, 1200],
        backgroundColor: ['rgba(54, 162, 235, 0.7)', 'rgba(255, 99, 132, 0.7)', 'rgba(75, 192, 192, 0.7)'],
        borderColor: ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)'],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Monthly Revenue' },
      },
      scales: {
        x: { title: { display: true, text: 'Month' } },
        y: { title: { display: true, text: 'Revenue' } },
      },
    },
  };
}

function makePieConfig(): ChartConfiguration {
  return {
    type: 'pie',
    data: {
      labels: ['Electronics', 'Clothing', 'Food'],
      datasets: [{
        label: 'Revenue by Category',
        data: [500, 300, 200],
        backgroundColor: ['rgba(54, 162, 235, 0.7)', 'rgba(255, 99, 132, 0.7)', 'rgba(75, 192, 192, 0.7)'],
        borderColor: ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)'],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Revenue by Category' },
        legend: { display: true, position: 'right' },
      },
    },
  };
}

function makeDoughnutConfig(): ChartConfiguration {
  return {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Pending', 'Cancelled'],
      datasets: [{
        label: 'Order Status',
        data: [80, 15, 5],
        backgroundColor: ['rgba(54, 162, 235, 0.7)', 'rgba(255, 99, 132, 0.7)', 'rgba(75, 192, 192, 0.7)'],
        borderColor: ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)', 'rgba(75, 192, 192, 1)'],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Order Status' },
        legend: { display: true, position: 'right' },
      },
    },
  };
}

function makeTableResult(): TableResult {
  return {
    type: 'table',
    title: 'Revenue by Product',
    headers: ['name', 'revenue'],
    rows: [
      ['Product 1', 100],
      ['Product 2', 200],
      ['Product 3', 300],
    ],
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('convertChartType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Same type → no-op ──────────────────────────────────────────

  describe('same type returns same config', () => {
    it('bar → bar returns identical config', () => {
      const config = makeBarConfig();
      const result = convertChartType(config, makeRows(), 'bar', makeMeta());
      expect(result).toBe(config);
    });

    it('line → line returns identical config', () => {
      const config = makeLineConfig();
      const result = convertChartType(config, makeRows(), 'line', makeMeta({ title: 'Monthly Revenue' }));
      expect(result).toBe(config);
    });

    it('pie → pie returns identical config', () => {
      const config = makePieConfig();
      const result = convertChartType(config, makeRows(), 'pie', makeMeta({ title: 'Revenue by Category' }));
      expect(result).toBe(config);
    });

    it('doughnut → doughnut returns identical config', () => {
      const config = makeDoughnutConfig();
      const result = convertChartType(config, makeRows(), 'doughnut', makeMeta({ title: 'Order Status' }));
      expect(result).toBe(config);
    });

    it('table → table returns identical config', () => {
      const config = makeTableResult();
      const result = convertChartType(config, makeRows(), 'table', makeMeta());
      expect(result).toBe(config);
    });
  });

  // ── Bar → other types ─────────────────────────────────────────

  describe('bar → other types', () => {
    it('bar → line produces line chart with same labels and data', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'line', makeMeta()) as ChartConfiguration;
      expect(result.type).toBe('line');
      expect(result.data.labels).toEqual(['Product 1', 'Product 2', 'Product 3']);
      expect(result.data.datasets[0].data).toEqual([100, 200, 300]);
    });

    it('bar → line preserves axis scales', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'line', makeMeta()) as ChartConfiguration;
      expect(result.options.scales).toBeDefined();
      expect(result.options.scales?.x.title.text).toBe('Product');
      expect(result.options.scales?.y.title.text).toBe('Revenue ($)');
    });

    it('bar → pie removes scales and adds legend', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'pie', makeMeta()) as ChartConfiguration;
      expect(result.type).toBe('pie');
      expect(result.options.scales).toBeUndefined();
      expect(result.options.plugins.legend).toEqual({ display: true, position: 'right' });
    });

    it('bar → pie preserves labels and data', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'pie', makeMeta()) as ChartConfiguration;
      expect(result.data.labels).toEqual(['Product 1', 'Product 2', 'Product 3']);
      expect(result.data.datasets[0].data).toEqual([100, 200, 300]);
    });

    it('bar → doughnut removes scales and adds legend', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'doughnut', makeMeta()) as ChartConfiguration;
      expect(result.type).toBe('doughnut');
      expect(result.options.scales).toBeUndefined();
      expect(result.options.plugins.legend).toEqual({ display: true, position: 'right' });
    });

    it('bar → table produces TableResult', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'table', makeMeta()) as TableResult;
      expect(result.type).toBe('table');
      expect(result.headers).toEqual(['name', 'revenue']);
      expect(result.rows).toEqual([
        ['Product 1', 100],
        ['Product 2', 200],
        ['Product 3', 300],
      ]);
    });

    it('bar → table includes title', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'table', makeMeta()) as TableResult;
      expect(result.title).toBe('Revenue by Product');
    });
  });

  // ── Line → other types ────────────────────────────────────────

  describe('line → other types', () => {
    it('line → bar produces bar chart', () => {
      const meta = makeMeta({ title: 'Monthly Revenue', xLabel: 'Month', yLabel: 'Revenue' });
      const result = convertChartType(makeLineConfig(), makeRows(), 'bar', meta) as ChartConfiguration;
      expect(result.type).toBe('bar');
      expect(result.options.scales).toBeDefined();
    });

    it('line → pie removes scales', () => {
      const meta = makeMeta({ title: 'Monthly Revenue' });
      const result = convertChartType(makeLineConfig(), makeRows(), 'pie', meta) as ChartConfiguration;
      expect(result.type).toBe('pie');
      expect(result.options.scales).toBeUndefined();
    });

    it('line → table produces TableResult', () => {
      const meta = makeMeta({ title: 'Monthly Revenue' });
      const result = convertChartType(makeLineConfig(), makeRows(), 'table', meta) as TableResult;
      expect(result.type).toBe('table');
    });
  });

  // ── Pie → other types ─────────────────────────────────────────

  describe('pie → other types', () => {
    it('pie → bar adds scales and removes legend', () => {
      const meta = makeMeta({ title: 'Revenue by Category' });
      const result = convertChartType(makePieConfig(), makeRows(), 'bar', meta) as ChartConfiguration;
      expect(result.type).toBe('bar');
      expect(result.options.scales).toBeDefined();
      expect(result.options.plugins.legend).toBeUndefined();
    });

    it('pie → line adds scales', () => {
      const meta = makeMeta({ title: 'Revenue by Category' });
      const result = convertChartType(makePieConfig(), makeRows(), 'line', meta) as ChartConfiguration;
      expect(result.type).toBe('line');
      expect(result.options.scales).toBeDefined();
    });

    it('pie → doughnut preserves legend and removes scales', () => {
      const meta = makeMeta({ title: 'Revenue by Category' });
      const result = convertChartType(makePieConfig(), makeRows(), 'doughnut', meta) as ChartConfiguration;
      expect(result.type).toBe('doughnut');
      expect(result.options.plugins.legend).toBeDefined();
      expect(result.options.scales).toBeUndefined();
    });

    it('pie → table produces TableResult', () => {
      const meta = makeMeta({ title: 'Revenue by Category' });
      const result = convertChartType(makePieConfig(), makeRows(), 'table', meta) as TableResult;
      expect(result.type).toBe('table');
      expect(result.headers).toEqual(['name', 'revenue']);
    });
  });

  // ── Doughnut → other types ────────────────────────────────────

  describe('doughnut → other types', () => {
    it('doughnut → bar adds scales', () => {
      const meta = makeMeta({ title: 'Order Status' });
      const result = convertChartType(makeDoughnutConfig(), makeRows(), 'bar', meta) as ChartConfiguration;
      expect(result.type).toBe('bar');
      expect(result.options.scales).toBeDefined();
    });

    it('doughnut → pie preserves legend', () => {
      const meta = makeMeta({ title: 'Order Status' });
      const result = convertChartType(makeDoughnutConfig(), makeRows(), 'pie', meta) as ChartConfiguration;
      expect(result.type).toBe('pie');
      expect(result.options.plugins.legend).toBeDefined();
    });

    it('doughnut → line adds scales', () => {
      const meta = makeMeta({ title: 'Order Status' });
      const result = convertChartType(makeDoughnutConfig(), makeRows(), 'line', meta) as ChartConfiguration;
      expect(result.type).toBe('line');
      expect(result.options.scales).toBeDefined();
    });
  });

  // ── Table → chart types ───────────────────────────────────────

  describe('table → chart types', () => {
    it('table → bar creates ChartConfiguration from rows + meta', () => {
      const result = convertChartType(makeTableResult(), makeRows(), 'bar', makeMeta()) as ChartConfiguration;
      expect(result.type).toBe('bar');
      expect(result.data.labels).toEqual(['Product 1', 'Product 2', 'Product 3']);
      expect(result.data.datasets[0].data).toEqual([100, 200, 300]);
    });

    it('table → bar includes scales with axis labels', () => {
      const result = convertChartType(makeTableResult(), makeRows(), 'bar', makeMeta()) as ChartConfiguration;
      expect(result.options.scales?.x.title.text).toBe('Product');
      expect(result.options.scales?.y.title.text).toBe('Revenue ($)');
    });

    it('table → line creates line chart from rows + meta', () => {
      const result = convertChartType(makeTableResult(), makeRows(), 'line', makeMeta()) as ChartConfiguration;
      expect(result.type).toBe('line');
      expect(result.data.labels).toEqual(['Product 1', 'Product 2', 'Product 3']);
      expect(result.data.datasets[0].data).toEqual([100, 200, 300]);
    });

    it('table → pie creates pie chart from rows + meta', () => {
      const result = convertChartType(makeTableResult(), makeRows(), 'pie', makeMeta()) as ChartConfiguration;
      expect(result.type).toBe('pie');
      expect(result.options.scales).toBeUndefined();
      expect(result.options.plugins.legend).toEqual({ display: true, position: 'right' });
    });

    it('table → doughnut creates doughnut chart from rows + meta', () => {
      const result = convertChartType(makeTableResult(), makeRows(), 'doughnut', makeMeta()) as ChartConfiguration;
      expect(result.type).toBe('doughnut');
      expect(result.options.scales).toBeUndefined();
      expect(result.options.plugins.legend).toBeDefined();
    });
  });

  // ── Title preservation ────────────────────────────────────────

  describe('title preservation', () => {
    it('preserves title when converting bar → line', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'line', makeMeta()) as ChartConfiguration;
      expect(result.options.plugins.title.text).toBe('Revenue by Product');
    });

    it('preserves title when converting bar → pie', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'pie', makeMeta()) as ChartConfiguration;
      expect(result.options.plugins.title.text).toBe('Revenue by Product');
    });

    it('preserves title when converting bar → table', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'table', makeMeta()) as TableResult;
      expect(result.title).toBe('Revenue by Product');
    });

    it('preserves title when converting table → bar', () => {
      const result = convertChartType(makeTableResult(), makeRows(), 'bar', makeMeta()) as ChartConfiguration;
      expect(result.options.plugins.title.text).toBe('Revenue by Product');
    });
  });

  // ── Color generation ──────────────────────────────────────────

  describe('color generation', () => {
    it('generates correct number of colors for target type', () => {
      // chart→chart conversion uses existing config data (3 items in makeBarConfig)
      const result = convertChartType(makeBarConfig(), makeRows(), 'pie', makeMeta()) as ChartConfiguration;
      expect(result.data.datasets[0].backgroundColor).toHaveLength(3);
      expect(result.data.datasets[0].borderColor).toHaveLength(3);
    });

    it('generates rgba backgroundColor', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'pie', makeMeta()) as ChartConfiguration;
      expect(result.data.datasets[0].backgroundColor[0]).toMatch(/^rgba\(/);
    });

    it('generates fully opaque borderColor', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'pie', makeMeta()) as ChartConfiguration;
      expect(result.data.datasets[0].borderColor![0]).toMatch(/1\)$/);
    });
  });

  // ── Dataset label ─────────────────────────────────────────────

  describe('dataset label', () => {
    it('sets dataset label to meta title', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'pie', makeMeta()) as ChartConfiguration;
      expect(result.data.datasets[0].label).toBe('Revenue by Product');
    });

    it('produces exactly one dataset', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'line', makeMeta()) as ChartConfiguration;
      expect(result.data.datasets).toHaveLength(1);
    });
  });

  // ── Edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty rows when converting to table', () => {
      const result = convertChartType(makeBarConfig(), [], 'table', makeMeta()) as TableResult;
      expect(result.type).toBe('table');
      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('handles empty rows when converting table → bar', () => {
      const result = convertChartType(makeTableResult(), [], 'bar', makeMeta()) as ChartConfiguration;
      expect(result.type).toBe('bar');
      expect(result.data.labels).toEqual([]);
      expect(result.data.datasets[0].data).toEqual([]);
    });

    it('handles null values in data rows', () => {
      const rows = [
        { name: 'Widget', revenue: null },
        { name: 'Gadget', revenue: 500 },
      ];
      const result = convertChartType(makeTableResult(), rows, 'bar', makeMeta()) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([0, 500]);
    });

    it('handles undefined values in data rows', () => {
      const rows = [
        { name: 'Widget', revenue: undefined },
        { name: 'Gadget', revenue: 300 },
      ];
      const result = convertChartType(makeTableResult(), rows, 'bar', makeMeta()) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([0, 300]);
    });

    it('handles string numeric values in data rows', () => {
      const rows = [
        { name: 'Widget', revenue: '1234.56' },
        { name: 'Gadget', revenue: '789' },
      ];
      const result = convertChartType(makeTableResult(), rows, 'bar', makeMeta()) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([1234.56, 789]);
    });

    it('handles null labels in data rows', () => {
      const rows = [
        { name: null, revenue: 100 },
        { name: 'Gadget', revenue: 200 },
      ];
      const result = convertChartType(makeTableResult(), rows, 'bar', makeMeta()) as ChartConfiguration;
      expect(result.data.labels).toEqual(['', 'Gadget']);
    });

    it('handles single row data (table → chart)', () => {
      const rows = [{ name: 'Widget', revenue: 500 }];
      const result = convertChartType(makeTableResult(), rows, 'pie', makeMeta()) as ChartConfiguration;
      expect(result.data.labels).toHaveLength(1);
      expect(result.data.datasets[0].data).toHaveLength(1);
    });

    it('handles large dataset (100+ rows)', () => {
      const rows = Array.from({ length: 150 }, (_, i) => ({
        name: `Product ${i}`,
        revenue: i * 10,
      }));
      const barConfig = makeBarConfig();
      const result = convertChartType(barConfig, rows, 'table', makeMeta()) as TableResult;
      expect(result.rows).toHaveLength(150);
    });

    it('logs warning when currentConfig is null', () => {
      const result = convertChartType(null as unknown as ChartSpecResult, makeRows(), 'bar', makeMeta());
      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('convertChartType: currentConfig is null');
    });
  });

  // ── Meta fallback for axis labels ─────────────────────────────

  describe('meta fallback for axis labels', () => {
    it('uses dataKey/labelKey when xLabel/yLabel are missing', () => {
      const meta = makeMeta({ xLabel: undefined, yLabel: undefined });
      const result = convertChartType(makeTableResult(), makeRows(), 'bar', meta) as ChartConfiguration;
      expect(result.options.scales?.x.title.text).toBe('name');
      expect(result.options.scales?.y.title.text).toBe('revenue');
    });

    it('uses xLabel/yLabel when provided', () => {
      const meta = makeMeta({ xLabel: 'Product Name', yLabel: 'Total Revenue' });
      const result = convertChartType(makeTableResult(), makeRows(), 'bar', meta) as ChartConfiguration;
      expect(result.options.scales?.x.title.text).toBe('Product Name');
      expect(result.options.scales?.y.title.text).toBe('Total Revenue');
    });
  });

  // ── Chart → chart axis label preservation ─────────────────────

  describe('chart → chart axis label preservation', () => {
    it('preserves source scales when converting bar → line', () => {
      const barConfig = makeBarConfig();
      const result = convertChartType(barConfig, makeRows(), 'line', makeMeta()) as ChartConfiguration;
      expect(result.options.scales?.x.title.text).toBe('Product');
      expect(result.options.scales?.y.title.text).toBe('Revenue ($)');
    });

    it('uses meta xLabel/yLabel when converting pie → bar (no source scales)', () => {
      const meta = makeMeta({ title: 'Revenue by Category', xLabel: 'Category', yLabel: 'Revenue ($)' });
      const result = convertChartType(makePieConfig(), makeRows(), 'bar', meta) as ChartConfiguration;
      expect(result.options.scales?.x.title.text).toBe('Category');
      expect(result.options.scales?.y.title.text).toBe('Revenue ($)');
    });

    it('uses meta xLabel/yLabel when converting doughnut → line (no source scales)', () => {
      const meta = makeMeta({ title: 'Order Status', xLabel: 'Status', yLabel: 'Count' });
      const result = convertChartType(makeDoughnutConfig(), makeRows(), 'line', meta) as ChartConfiguration;
      expect(result.options.scales?.x.title.text).toBe('Status');
      expect(result.options.scales?.y.title.text).toBe('Count');
    });

    it('falls back to dataKey/labelKey when pie → bar and no xLabel/yLabel in meta', () => {
      const meta = makeMeta({ title: 'Revenue by Category', xLabel: undefined, yLabel: undefined });
      const result = convertChartType(makePieConfig(), makeRows(), 'bar', meta) as ChartConfiguration;
      expect(result.options.scales?.x.title.text).toBe('name');
      expect(result.options.scales?.y.title.text).toBe('revenue');
    });
  });

  // ── Responsive and borderWidth ────────────────────────────────

  describe('config properties', () => {
    it('sets responsive to true', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'pie', makeMeta()) as ChartConfiguration;
      expect(result.options.responsive).toBe(true);
    });

    it('sets borderWidth to 1', () => {
      const result = convertChartType(makeBarConfig(), makeRows(), 'line', makeMeta()) as ChartConfiguration;
      expect(result.data.datasets[0].borderWidth).toBe(1);
    });
  });

  // ── Table structure ───────────────────────────────────────────

  describe('table structure', () => {
    it('table → table with multi-column rows', () => {
      const rows = [
        { name: 'Widget', revenue: 1000, quantity: 50, category: 'Electronics' },
        { name: 'Gadget', revenue: 800, quantity: 30, category: 'Tools' },
      ];
      const result = convertChartType(makeBarConfig(), rows, 'table', makeMeta()) as TableResult;
      expect(result.headers).toEqual(['name', 'revenue', 'quantity', 'category']);
      expect(result.rows).toEqual([
        ['Widget', 1000, 50, 'Electronics'],
        ['Gadget', 800, 30, 'Tools'],
      ]);
    });
  });
});
