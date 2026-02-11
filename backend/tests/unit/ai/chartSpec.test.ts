import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ChartSpec, ChartConfiguration, TableResult } from '../../../src/ai/types.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { toChartConfig, generateColors, generateBorderColors } = await import(
  '../../../src/ai/chartSpec.js'
);
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ──────────────────────────────────────────────────────────

function makeSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    type: 'bar',
    title: 'Revenue by Product',
    xLabel: 'Product',
    yLabel: 'Revenue ($)',
    dataKey: 'revenue',
    labelKey: 'name',
    ...overrides,
  };
}

function makeRows(count = 3): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Product ${i + 1}`,
    revenue: (i + 1) * 100,
  }));
}

// ── Tests ────────────────────────────────────────────────────────────

describe('toChartConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Null / empty returns ────────────────────────────────────────

  describe('null returns', () => {
    it('returns null when chartSpec is null', () => {
      const result = toChartConfig(null, makeRows());
      expect(result).toBeNull();
    });

    it('returns null when rows array is empty', () => {
      const result = toChartConfig(makeSpec(), []);
      expect(result).toBeNull();
    });

    it('logs warning when rows array is empty', () => {
      toChartConfig(makeSpec(), []);
      expect(logger.warn).toHaveBeenCalledWith(
        { chartType: 'bar' },
        'Chart spec: no rows to chart',
      );
    });

    it('returns null when rows is undefined-like', () => {
      const result = toChartConfig(makeSpec(), undefined as unknown as Record<string, unknown>[]);
      expect(result).toBeNull();
    });

    it('returns null when dataKey is not found in rows', () => {
      const rows = [{ name: 'Widget', total: 100 }];
      const result = toChartConfig(makeSpec({ dataKey: 'revenue' }), rows);
      expect(result).toBeNull();
    });

    it('logs warning with available keys when dataKey not found', () => {
      const rows = [{ name: 'Widget', total: 100 }];
      toChartConfig(makeSpec({ dataKey: 'revenue' }), rows);
      expect(logger.warn).toHaveBeenCalledWith(
        { dataKey: 'revenue', availableKeys: ['name', 'total'] },
        'Chart spec: dataKey not found in result rows',
      );
    });

    it('returns null when labelKey is not found in rows', () => {
      const rows = [{ product: 'Widget', revenue: 100 }];
      const result = toChartConfig(makeSpec({ labelKey: 'name' }), rows);
      expect(result).toBeNull();
    });

    it('logs warning with available keys when labelKey not found', () => {
      const rows = [{ product: 'Widget', revenue: 100 }];
      toChartConfig(makeSpec({ labelKey: 'name' }), rows);
      expect(logger.warn).toHaveBeenCalledWith(
        { labelKey: 'name', availableKeys: ['product', 'revenue'] },
        'Chart spec: labelKey not found in result rows',
      );
    });
  });

  // ── Bar chart ───────────────────────────────────────────────────

  describe('bar chart', () => {
    it('returns ChartConfiguration with type "bar"', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.type).toBe('bar');
    });

    it('maps labels from labelKey column', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.data.labels).toEqual(['Product 1', 'Product 2', 'Product 3']);
    });

    it('maps data from dataKey column', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([100, 200, 300]);
    });

    it('sets dataset label to spec title', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.data.datasets[0].label).toBe('Revenue by Product');
    });

    it('generates correct number of backgroundColor entries', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.data.datasets[0].backgroundColor).toHaveLength(3);
    });

    it('generates correct number of borderColor entries', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.data.datasets[0].borderColor).toHaveLength(3);
    });

    it('sets borderWidth to 1', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.data.datasets[0].borderWidth).toBe(1);
    });

    it('sets responsive to true', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.options.responsive).toBe(true);
    });

    it('sets title plugin with spec title', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.options.plugins.title).toEqual({
        display: true,
        text: 'Revenue by Product',
      });
    });

    it('includes x-axis scale with xLabel', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.options.scales?.x).toEqual({
        title: { display: true, text: 'Product' },
      });
    });

    it('includes y-axis scale with yLabel', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.options.scales?.y).toEqual({
        title: { display: true, text: 'Revenue ($)' },
      });
    });

    it('falls back to dataKey/labelKey when xLabel/yLabel are missing', () => {
      const spec = makeSpec({ xLabel: undefined, yLabel: undefined });
      const result = toChartConfig(spec, makeRows()) as ChartConfiguration;
      expect(result.options.scales?.x.title.text).toBe('name');
      expect(result.options.scales?.y.title.text).toBe('revenue');
    });

    it('does not include legend plugin', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.options.plugins.legend).toBeUndefined();
    });
  });

  // ── Line chart ──────────────────────────────────────────────────

  describe('line chart', () => {
    it('returns ChartConfiguration with type "line"', () => {
      const spec = makeSpec({ type: 'line', title: 'Revenue Over Time', xLabel: 'Date', yLabel: 'Revenue' });
      const rows = [
        { name: '2026-01-01', revenue: 500 },
        { name: '2026-01-02', revenue: 750 },
        { name: '2026-01-03', revenue: 600 },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.type).toBe('line');
    });

    it('includes scales for line chart', () => {
      const spec = makeSpec({ type: 'line', xLabel: 'Date', yLabel: 'Revenue' });
      const result = toChartConfig(spec, makeRows()) as ChartConfiguration;
      expect(result.options.scales).toBeDefined();
      expect(result.options.scales?.x.title.text).toBe('Date');
      expect(result.options.scales?.y.title.text).toBe('Revenue');
    });

    it('has borderColor for line datasets', () => {
      const spec = makeSpec({ type: 'line' });
      const result = toChartConfig(spec, makeRows()) as ChartConfiguration;
      expect(result.data.datasets[0].borderColor).toHaveLength(3);
    });
  });

  // ── Pie chart ───────────────────────────────────────────────────

  describe('pie chart', () => {
    it('returns ChartConfiguration with type "pie"', () => {
      const spec = makeSpec({ type: 'pie', title: 'Revenue Share' });
      const result = toChartConfig(spec, makeRows()) as ChartConfiguration;
      expect(result.type).toBe('pie');
    });

    it('does not include scales for pie chart', () => {
      const spec = makeSpec({ type: 'pie' });
      const result = toChartConfig(spec, makeRows()) as ChartConfiguration;
      expect(result.options.scales).toBeUndefined();
    });

    it('includes legend with display true and position right', () => {
      const spec = makeSpec({ type: 'pie' });
      const result = toChartConfig(spec, makeRows()) as ChartConfiguration;
      expect(result.options.plugins.legend).toEqual({
        display: true,
        position: 'right',
      });
    });

    it('maps labels and data correctly', () => {
      const spec = makeSpec({ type: 'pie' });
      const rows = [
        { name: 'Completed', revenue: 1000 },
        { name: 'Pending', revenue: 300 },
        { name: 'Refunded', revenue: 50 },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.labels).toEqual(['Completed', 'Pending', 'Refunded']);
      expect(result.data.datasets[0].data).toEqual([1000, 300, 50]);
    });
  });

  // ── Doughnut chart ──────────────────────────────────────────────

  describe('doughnut chart', () => {
    it('returns ChartConfiguration with type "doughnut"', () => {
      const spec = makeSpec({ type: 'doughnut', title: 'Order Status' });
      const result = toChartConfig(spec, makeRows()) as ChartConfiguration;
      expect(result.type).toBe('doughnut');
    });

    it('does not include scales for doughnut chart', () => {
      const spec = makeSpec({ type: 'doughnut' });
      const result = toChartConfig(spec, makeRows()) as ChartConfiguration;
      expect(result.options.scales).toBeUndefined();
    });

    it('includes legend plugin', () => {
      const spec = makeSpec({ type: 'doughnut' });
      const result = toChartConfig(spec, makeRows()) as ChartConfiguration;
      expect(result.options.plugins.legend).toBeDefined();
    });
  });

  // ── Table type ──────────────────────────────────────────────────

  describe('table type', () => {
    it('returns TableResult with type "table"', () => {
      const spec = makeSpec({ type: 'table', title: 'Top Products' });
      const rows = [
        { name: 'Widget', revenue: 1000, quantity: 50 },
        { name: 'Gadget', revenue: 800, quantity: 30 },
      ];
      const result = toChartConfig(spec, rows) as TableResult;
      expect(result.type).toBe('table');
    });

    it('includes title from spec', () => {
      const spec = makeSpec({ type: 'table', title: 'Sales Report' });
      const result = toChartConfig(spec, makeRows()) as TableResult;
      expect(result.title).toBe('Sales Report');
    });

    it('extracts all column keys as headers', () => {
      const spec = makeSpec({ type: 'table' });
      const rows = [
        { name: 'Widget', revenue: 1000, quantity: 50 },
      ];
      const result = toChartConfig(spec, rows) as TableResult;
      expect(result.headers).toEqual(['name', 'revenue', 'quantity']);
    });

    it('maps rows to arrays matching header order', () => {
      const spec = makeSpec({ type: 'table' });
      const rows = [
        { name: 'Widget', revenue: 1000 },
        { name: 'Gadget', revenue: 800 },
      ];
      const result = toChartConfig(spec, rows) as TableResult;
      expect(result.rows).toEqual([
        ['Widget', 1000],
        ['Gadget', 800],
      ]);
    });

    it('handles rows with null values', () => {
      const spec = makeSpec({ type: 'table' });
      const rows = [
        { name: 'Widget', revenue: null },
      ];
      const result = toChartConfig(spec, rows) as TableResult;
      expect(result.rows).toEqual([['Widget', null]]);
    });
  });

  // ── Numeric coercion ────────────────────────────────────────────

  describe('numeric coercion', () => {
    it('converts string numbers to actual numbers', () => {
      const spec = makeSpec();
      const rows = [
        { name: 'Widget', revenue: '1234.56' },
        { name: 'Gadget', revenue: '789.00' },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([1234.56, 789]);
    });

    it('converts null values to 0', () => {
      const spec = makeSpec();
      const rows = [
        { name: 'Widget', revenue: null },
        { name: 'Gadget', revenue: 500 },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([0, 500]);
    });

    it('converts undefined values to 0', () => {
      const spec = makeSpec();
      const rows = [
        { name: 'Widget', revenue: undefined },
        { name: 'Gadget', revenue: 500 },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([0, 500]);
    });

    it('converts non-numeric strings to 0', () => {
      const spec = makeSpec();
      const rows = [
        { name: 'Widget', revenue: 'not-a-number' },
        { name: 'Gadget', revenue: 500 },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([0, 500]);
    });

    it('converts Infinity to 0', () => {
      const spec = makeSpec();
      const rows = [
        { name: 'Widget', revenue: Infinity },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([0]);
    });

    it('converts NaN to 0', () => {
      const spec = makeSpec();
      const rows = [
        { name: 'Widget', revenue: NaN },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.datasets[0].data).toEqual([0]);
    });
  });

  // ── Label coercion ──────────────────────────────────────────────

  describe('label coercion', () => {
    it('converts numeric labels to strings', () => {
      const spec = makeSpec({ labelKey: 'month' });
      const rows = [
        { month: 1, revenue: 100 },
        { month: 2, revenue: 200 },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.labels).toEqual(['1', '2']);
    });

    it('converts null labels to empty string', () => {
      const spec = makeSpec();
      const rows = [
        { name: null, revenue: 100 },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.labels).toEqual(['']);
    });

    it('converts undefined labels to empty string', () => {
      const spec = makeSpec();
      const rows = [
        { name: undefined, revenue: 100 },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.labels).toEqual(['']);
    });

    it('preserves date string labels as-is', () => {
      const spec = makeSpec({ labelKey: 'date' });
      const rows = [
        { date: '2026-01-15', revenue: 100 },
      ];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.labels).toEqual(['2026-01-15']);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles single row data', () => {
      const spec = makeSpec();
      const rows = [{ name: 'Widget', revenue: 500 }];
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.labels).toEqual(['Widget']);
      expect(result.data.datasets[0].data).toEqual([500]);
      expect(result.data.datasets[0].backgroundColor).toHaveLength(1);
    });

    it('handles large dataset (100+ rows)', () => {
      const spec = makeSpec();
      const rows = Array.from({ length: 150 }, (_, i) => ({
        name: `Product ${i}`,
        revenue: i * 10,
      }));
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      expect(result.data.labels).toHaveLength(150);
      expect(result.data.datasets[0].data).toHaveLength(150);
      expect(result.data.datasets[0].backgroundColor).toHaveLength(150);
    });

    it('cycles colors when data exceeds palette size', () => {
      const spec = makeSpec();
      const rows = Array.from({ length: 15 }, (_, i) => ({
        name: `P${i}`,
        revenue: i * 10,
      }));
      const result = toChartConfig(spec, rows) as ChartConfiguration;
      const colors = result.data.datasets[0].backgroundColor;
      // Colors should cycle — element 12 should equal element 0
      expect(colors[12]).toBe(colors[0]);
    });

    it('produces exactly one dataset', () => {
      const result = toChartConfig(makeSpec(), makeRows()) as ChartConfiguration;
      expect(result.data.datasets).toHaveLength(1);
    });
  });
});

// ── generateColors ──────────────────────────────────────────────────

describe('generateColors', () => {
  it('returns empty array for count 0', () => {
    expect(generateColors(0)).toEqual([]);
  });

  it('returns correct number of colors', () => {
    expect(generateColors(5)).toHaveLength(5);
  });

  it('returns rgba strings', () => {
    const colors = generateColors(1);
    expect(colors[0]).toMatch(/^rgba\(/);
  });

  it('cycles when count exceeds palette size', () => {
    const colors = generateColors(15);
    expect(colors).toHaveLength(15);
    expect(colors[12]).toBe(colors[0]);
  });
});

// ── generateBorderColors ────────────────────────────────────────────

describe('generateBorderColors', () => {
  it('returns empty array for count 0', () => {
    expect(generateBorderColors(0)).toEqual([]);
  });

  it('returns correct number of colors', () => {
    expect(generateBorderColors(5)).toHaveLength(5);
  });

  it('returns fully opaque rgba strings', () => {
    const colors = generateBorderColors(1);
    expect(colors[0]).toMatch(/1\)$/);
  });

  it('cycles when count exceeds palette size', () => {
    const colors = generateBorderColors(15);
    expect(colors).toHaveLength(15);
    expect(colors[12]).toBe(colors[0]);
  });
});
