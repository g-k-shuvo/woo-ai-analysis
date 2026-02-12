import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type {
  ChartConfiguration,
  ChartMeta,
  ChartSpec,
  TableResult,
} from '../../src/ai/types.js';

// ── Mock logger ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { convertChartType } = await import('../../src/ai/chartTypeConverter.js');
const { toChartConfig } = await import('../../src/ai/chartSpec.js');

// ── Helpers ─────────────────────────────────────────────────────────

function makeMeta(spec: ChartSpec): ChartMeta & { title: string } {
  return {
    title: spec.title,
    dataKey: spec.dataKey,
    labelKey: spec.labelKey,
    xLabel: spec.xLabel,
    yLabel: spec.yLabel,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('chartTypeConverter integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Revenue query pipeline ────────────────────────────────────

  describe('revenue query → all chart types', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Revenue by Product',
      xLabel: 'Product',
      yLabel: 'Revenue ($)',
      dataKey: 'revenue',
      labelKey: 'product_name',
    };

    const rows = [
      { product_name: 'Widget Pro', revenue: '12500.00' },
      { product_name: 'Gadget X', revenue: '8900.50' },
      { product_name: 'Tool Kit', revenue: '6200.75' },
      { product_name: 'Accessory Pack', revenue: '3100.25' },
      { product_name: 'Premium Bundle', revenue: '15800.00' },
    ];

    it('toChartConfig produces bar chart → convert to all types', () => {
      const barConfig = toChartConfig(spec, rows) as ChartConfiguration;
      expect(barConfig.type).toBe('bar');

      const meta = makeMeta(spec);

      // Bar → Line
      const lineResult = convertChartType(barConfig, rows, 'line', meta) as ChartConfiguration;
      expect(lineResult.type).toBe('line');
      expect(lineResult.data.labels).toEqual(barConfig.data.labels);
      expect(lineResult.data.datasets[0].data).toEqual(barConfig.data.datasets[0].data);
      expect(lineResult.options.scales).toBeDefined();

      // Bar → Pie
      const pieResult = convertChartType(barConfig, rows, 'pie', meta) as ChartConfiguration;
      expect(pieResult.type).toBe('pie');
      expect(pieResult.data.labels).toEqual(barConfig.data.labels);
      expect(pieResult.options.scales).toBeUndefined();
      expect(pieResult.options.plugins.legend).toBeDefined();

      // Bar → Doughnut
      const doughnutResult = convertChartType(barConfig, rows, 'doughnut', meta) as ChartConfiguration;
      expect(doughnutResult.type).toBe('doughnut');
      expect(doughnutResult.data.labels).toEqual(barConfig.data.labels);

      // Bar → Table
      const tableResult = convertChartType(barConfig, rows, 'table', meta) as TableResult;
      expect(tableResult.type).toBe('table');
      expect(tableResult.headers).toEqual(['product_name', 'revenue']);
      expect(tableResult.rows).toHaveLength(5);

      // Table → Bar (round-trip)
      const backToBar = convertChartType(tableResult, rows, 'bar', meta) as ChartConfiguration;
      expect(backToBar.type).toBe('bar');
      expect(backToBar.data.labels).toEqual(barConfig.data.labels);
      // Data is re-parsed from rows, so values are coerced from strings
      expect(backToBar.data.datasets[0].data).toEqual([12500, 8900.5, 6200.75, 3100.25, 15800]);
    });
  });

  // ── Product query pipeline ────────────────────────────────────

  describe('product query → pie to other types', () => {
    const spec: ChartSpec = {
      type: 'pie',
      title: 'Revenue by Category',
      dataKey: 'total_revenue',
      labelKey: 'category',
    };

    const rows = [
      { category: 'Electronics', total_revenue: 45000 },
      { category: 'Clothing', total_revenue: 32000 },
      { category: 'Food & Drink', total_revenue: 18000 },
      { category: 'Books', total_revenue: 8500 },
    ];

    it('toChartConfig produces pie chart → convert to bar and table', () => {
      const pieConfig = toChartConfig(spec, rows) as ChartConfiguration;
      expect(pieConfig.type).toBe('pie');

      const meta = makeMeta(spec);

      // Pie → Bar: must use meta for axis labels since pie has no scales
      const barResult = convertChartType(pieConfig, rows, 'bar', meta) as ChartConfiguration;
      expect(barResult.type).toBe('bar');
      expect(barResult.data.labels).toEqual(['Electronics', 'Clothing', 'Food & Drink', 'Books']);
      expect(barResult.data.datasets[0].data).toEqual([45000, 32000, 18000, 8500]);
      expect(barResult.options.scales).toBeDefined();
      expect(barResult.options.scales?.x.title.text).toBe('category');
      expect(barResult.options.scales?.y.title.text).toBe('total_revenue');

      // Pie → Table
      const tableResult = convertChartType(pieConfig, rows, 'table', meta) as TableResult;
      expect(tableResult.type).toBe('table');
      expect(tableResult.rows[0]).toEqual(['Electronics', 45000]);

      // Table → Pie (round-trip)
      const backToPie = convertChartType(tableResult, rows, 'pie', meta) as ChartConfiguration;
      expect(backToPie.type).toBe('pie');
      expect(backToPie.data.labels).toEqual(pieConfig.data.labels);
    });
  });

  // ── Time series query pipeline ────────────────────────────────

  describe('time series query → line to other types', () => {
    const spec: ChartSpec = {
      type: 'line',
      title: 'Revenue Trend (Last 7 Days)',
      xLabel: 'Date',
      yLabel: 'Revenue ($)',
      dataKey: 'daily_revenue',
      labelKey: 'order_date',
    };

    const rows = [
      { order_date: '2026-02-06', daily_revenue: '1250.00' },
      { order_date: '2026-02-07', daily_revenue: '980.50' },
      { order_date: '2026-02-08', daily_revenue: '1450.75' },
      { order_date: '2026-02-09', daily_revenue: '2100.00' },
      { order_date: '2026-02-10', daily_revenue: '1800.25' },
      { order_date: '2026-02-11', daily_revenue: '1650.00' },
      { order_date: '2026-02-12', daily_revenue: '1920.50' },
    ];

    it('toChartConfig produces line chart → convert to bar and table', () => {
      const lineConfig = toChartConfig(spec, rows) as ChartConfiguration;
      expect(lineConfig.type).toBe('line');

      const meta = makeMeta(spec);

      // Line → Bar
      const barResult = convertChartType(lineConfig, rows, 'bar', meta) as ChartConfiguration;
      expect(barResult.type).toBe('bar');
      expect(barResult.data.labels).toHaveLength(7);
      expect(barResult.options.scales?.x.title.text).toBe('Date');

      // Line → Table
      const tableResult = convertChartType(lineConfig, rows, 'table', meta) as TableResult;
      expect(tableResult.type).toBe('table');
      expect(tableResult.rows).toHaveLength(7);
      expect(tableResult.headers).toContain('order_date');
      expect(tableResult.headers).toContain('daily_revenue');
    });
  });

  // ── Table query pipeline ──────────────────────────────────────

  describe('table query → convert to chart types', () => {
    const spec: ChartSpec = {
      type: 'table',
      title: 'Top 5 Customers',
      dataKey: 'total_spent',
      labelKey: 'customer_name',
    };

    const rows = [
      { customer_name: 'Alice Johnson', total_spent: 5200, order_count: 12 },
      { customer_name: 'Bob Smith', total_spent: 4800, order_count: 8 },
      { customer_name: 'Carol White', total_spent: 3500, order_count: 15 },
      { customer_name: 'Dave Brown', total_spent: 2900, order_count: 6 },
      { customer_name: 'Eve Davis', total_spent: 2100, order_count: 4 },
    ];

    it('toChartConfig produces table → convert to bar chart', () => {
      const tableConfig = toChartConfig(spec, rows) as TableResult;
      expect(tableConfig.type).toBe('table');
      expect(tableConfig.headers).toEqual(['customer_name', 'total_spent', 'order_count']);

      const meta = makeMeta(spec);

      // Table → Bar
      const barResult = convertChartType(tableConfig, rows, 'bar', meta) as ChartConfiguration;
      expect(barResult.type).toBe('bar');
      expect(barResult.data.labels).toEqual([
        'Alice Johnson', 'Bob Smith', 'Carol White', 'Dave Brown', 'Eve Davis',
      ]);
      expect(barResult.data.datasets[0].data).toEqual([5200, 4800, 3500, 2900, 2100]);

      // Table → Pie
      const pieResult = convertChartType(tableConfig, rows, 'pie', meta) as ChartConfiguration;
      expect(pieResult.type).toBe('pie');
      expect(pieResult.data.datasets[0].data).toEqual([5200, 4800, 3500, 2900, 2100]);
    });
  });

  // ── Full cycle: all types ─────────────────────────────────────

  describe('full cycle through all chart types', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Order Status Breakdown',
      xLabel: 'Status',
      yLabel: 'Count',
      dataKey: 'order_count',
      labelKey: 'status',
    };

    const rows = [
      { status: 'completed', order_count: 150 },
      { status: 'processing', order_count: 25 },
      { status: 'pending', order_count: 10 },
      { status: 'cancelled', order_count: 5 },
    ];

    it('bar → line → pie → doughnut → table → bar preserves data', () => {
      const barConfig = toChartConfig(spec, rows) as ChartConfiguration;
      const meta = makeMeta(spec);

      // Bar → Line
      const line = convertChartType(barConfig, rows, 'line', meta) as ChartConfiguration;
      expect(line.type).toBe('line');

      // Line → Pie
      const pie = convertChartType(line, rows, 'pie', meta) as ChartConfiguration;
      expect(pie.type).toBe('pie');

      // Pie → Doughnut
      const doughnut = convertChartType(pie, rows, 'doughnut', meta) as ChartConfiguration;
      expect(doughnut.type).toBe('doughnut');

      // Doughnut → Table
      const table = convertChartType(doughnut, rows, 'table', meta) as TableResult;
      expect(table.type).toBe('table');
      expect(table.rows).toHaveLength(4);

      // Table → Bar (full cycle)
      const backToBar = convertChartType(table, rows, 'bar', meta) as ChartConfiguration;
      expect(backToBar.type).toBe('bar');
      expect(backToBar.data.labels).toEqual(['completed', 'processing', 'pending', 'cancelled']);
      expect(backToBar.data.datasets[0].data).toEqual([150, 25, 10, 5]);
      expect(backToBar.options.scales?.x.title.text).toBe('Status');
      expect(backToBar.options.scales?.y.title.text).toBe('Count');
    });
  });

  // ── Edge case: single aggregate ───────────────────────────────

  describe('single aggregate (no chart spec)', () => {
    it('toChartConfig returns null for null spec — no conversion possible', () => {
      const rows = [{ total_revenue: 12345.67 }];
      const config = toChartConfig(null, rows);
      expect(config).toBeNull();
    });
  });

  // ── String numeric coercion from real query results ───────────

  describe('string numeric coercion', () => {
    it('converts PostgreSQL string numerics correctly during table → chart conversion', () => {
      const spec: ChartSpec = {
        type: 'table',
        title: 'Revenue Summary',
        dataKey: 'total',
        labelKey: 'month',
      };

      const rows = [
        { month: '2026-01', total: '45678.90' },
        { month: '2026-02', total: '52340.15' },
        { month: '2026-03', total: '38920.00' },
      ];

      const tableConfig = toChartConfig(spec, rows) as TableResult;
      const meta = makeMeta(spec);

      const barResult = convertChartType(tableConfig, rows, 'bar', meta) as ChartConfiguration;
      expect(barResult.data.datasets[0].data).toEqual([45678.9, 52340.15, 38920]);
    });
  });
});
