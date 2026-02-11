import { jest, describe, it, expect } from '@jest/globals';
import type {
  ChartSpec,
  ChartConfiguration,
  TableResult,
  QueryExecutionResult,
  AIQueryResult,
} from '../../src/ai/types.js';

/**
 * Integration tests for chartSpec module.
 *
 * These tests verify that toChartConfig produces valid Chart.js configurations
 * when given realistic data shapes matching actual query executor output.
 * They test the full contract between the AI pipeline → query executor → chart spec
 * chain using representative data from revenue, product, customer, and order queries.
 */

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { toChartConfig } = await import('../../src/ai/chartSpec.js');

// ── Realistic query result shapes ────────────────────────────────

describe('Chart spec integration — revenue queries', () => {
  it('converts revenue-by-month result into a bar chart', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Monthly Revenue',
      xLabel: 'Month',
      yLabel: 'Revenue ($)',
      dataKey: 'total_revenue',
      labelKey: 'month',
    };
    const rows: Record<string, unknown>[] = [
      { month: '2026-01', total_revenue: '12450.50', order_count: '87' },
      { month: '2026-02', total_revenue: '15320.00', order_count: '102' },
      { month: '2026-03', total_revenue: '11200.75', order_count: '78' },
    ];

    const result = toChartConfig(spec, rows) as ChartConfiguration;

    expect(result.type).toBe('bar');
    expect(result.data.labels).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(result.data.datasets[0].data).toEqual([12450.50, 15320, 11200.75]);
    expect(result.options.scales?.x.title.text).toBe('Month');
    expect(result.options.scales?.y.title.text).toBe('Revenue ($)');
  });

  it('converts revenue-over-time result into a line chart', () => {
    const spec: ChartSpec = {
      type: 'line',
      title: 'Daily Revenue (Last 7 Days)',
      xLabel: 'Date',
      yLabel: 'Revenue ($)',
      dataKey: 'daily_total',
      labelKey: 'date_created',
    };
    const rows: Record<string, unknown>[] = [
      { date_created: '2026-02-06', daily_total: '1820.00' },
      { date_created: '2026-02-07', daily_total: '2105.50' },
      { date_created: '2026-02-08', daily_total: '1450.25' },
      { date_created: '2026-02-09', daily_total: '3200.00' },
      { date_created: '2026-02-10', daily_total: '2890.75' },
      { date_created: '2026-02-11', daily_total: '1675.00' },
      { date_created: '2026-02-12', daily_total: '2340.50' },
    ];

    const result = toChartConfig(spec, rows) as ChartConfiguration;

    expect(result.type).toBe('line');
    expect(result.data.labels).toHaveLength(7);
    expect(result.data.datasets[0].data).toHaveLength(7);
    expect(result.data.datasets[0].data[3]).toBe(3200);
    expect(result.options.scales).toBeDefined();
  });

  it('returns null for single-aggregate revenue query (no chart)', () => {
    // AI returns chartSpec: null for "What is my total revenue?"
    const result = toChartConfig(null, [{ total_revenue: '45250.00' }]);
    expect(result).toBeNull();
  });
});

describe('Chart spec integration — product queries', () => {
  it('converts top-sellers result into a bar chart', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Top 10 Products by Revenue',
      xLabel: 'Product',
      yLabel: 'Revenue ($)',
      dataKey: 'revenue',
      labelKey: 'name',
    };
    const rows: Record<string, unknown>[] = [
      { name: 'Premium Widget', revenue: '4250.00', quantity_sold: '85' },
      { name: 'Basic Widget', revenue: '2100.00', quantity_sold: '210' },
      { name: 'Pro Gadget', revenue: '1890.50', quantity_sold: '63' },
      { name: 'Starter Pack', revenue: '1450.00', quantity_sold: '145' },
      { name: 'Deluxe Bundle', revenue: '1200.00', quantity_sold: '24' },
    ];

    const result = toChartConfig(spec, rows) as ChartConfiguration;

    expect(result.type).toBe('bar');
    expect(result.data.labels).toEqual([
      'Premium Widget', 'Basic Widget', 'Pro Gadget', 'Starter Pack', 'Deluxe Bundle',
    ]);
    expect(result.data.datasets[0].data).toEqual([4250, 2100, 1890.5, 1450, 1200]);
  });

  it('converts category performance into a pie chart', () => {
    const spec: ChartSpec = {
      type: 'pie',
      title: 'Revenue by Category',
      dataKey: 'category_revenue',
      labelKey: 'category_name',
    };
    const rows: Record<string, unknown>[] = [
      { category_name: 'Electronics', category_revenue: '15000.00' },
      { category_name: 'Clothing', category_revenue: '8500.00' },
      { category_name: 'Home & Garden', category_revenue: '4200.00' },
      { category_name: 'Books', category_revenue: '2100.00' },
    ];

    const result = toChartConfig(spec, rows) as ChartConfiguration;

    expect(result.type).toBe('pie');
    expect(result.data.labels).toEqual(['Electronics', 'Clothing', 'Home & Garden', 'Books']);
    expect(result.data.datasets[0].data).toEqual([15000, 8500, 4200, 2100]);
    expect(result.options.plugins.legend).toEqual({ display: true, position: 'right' });
    expect(result.options.scales).toBeUndefined();
  });
});

describe('Chart spec integration — customer queries', () => {
  it('converts new vs returning customers into a doughnut chart', () => {
    const spec: ChartSpec = {
      type: 'doughnut',
      title: 'New vs Returning Customers',
      dataKey: 'customer_count',
      labelKey: 'customer_type',
    };
    const rows: Record<string, unknown>[] = [
      { customer_type: 'New', customer_count: '340' },
      { customer_type: 'Returning', customer_count: '520' },
    ];

    const result = toChartConfig(spec, rows) as ChartConfiguration;

    expect(result.type).toBe('doughnut');
    expect(result.data.labels).toEqual(['New', 'Returning']);
    expect(result.data.datasets[0].data).toEqual([340, 520]);
    expect(result.options.scales).toBeUndefined();
    expect(result.options.plugins.legend?.display).toBe(true);
  });

  it('converts top spenders into a table result', () => {
    const spec: ChartSpec = {
      type: 'table',
      title: 'Top 5 Customers by Spend',
      dataKey: 'total_spent',
      labelKey: 'display_name',
    };
    const rows: Record<string, unknown>[] = [
      { display_name: 'Customer A', total_spent: '8500.00', order_count: 42 },
      { display_name: 'Customer B', total_spent: '6200.00', order_count: 28 },
      { display_name: 'Customer C', total_spent: '5100.50', order_count: 35 },
    ];

    const result = toChartConfig(spec, rows) as TableResult;

    expect(result.type).toBe('table');
    expect(result.title).toBe('Top 5 Customers by Spend');
    expect(result.headers).toEqual(['display_name', 'total_spent', 'order_count']);
    expect(result.rows).toEqual([
      ['Customer A', '8500.00', 42],
      ['Customer B', '6200.00', 28],
      ['Customer C', '5100.50', 35],
    ]);
  });
});

describe('Chart spec integration — order queries', () => {
  it('converts order status breakdown into a pie chart', () => {
    const spec: ChartSpec = {
      type: 'pie',
      title: 'Orders by Status',
      dataKey: 'order_count',
      labelKey: 'status',
    };
    const rows: Record<string, unknown>[] = [
      { status: 'completed', order_count: '450' },
      { status: 'processing', order_count: '85' },
      { status: 'on-hold', order_count: '32' },
      { status: 'refunded', order_count: '15' },
      { status: 'cancelled', order_count: '8' },
    ];

    const result = toChartConfig(spec, rows) as ChartConfiguration;

    expect(result.type).toBe('pie');
    expect(result.data.labels).toHaveLength(5);
    expect(result.data.datasets[0].data).toEqual([450, 85, 32, 15, 8]);
  });

  it('converts AOV trend into a line chart', () => {
    const spec: ChartSpec = {
      type: 'line',
      title: 'Average Order Value (Last 30 Days)',
      xLabel: 'Date',
      yLabel: 'AOV ($)',
      dataKey: 'avg_order_value',
      labelKey: 'order_date',
    };
    const rows: Record<string, unknown>[] = Array.from({ length: 30 }, (_, i) => ({
      order_date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      avg_order_value: String((50 + Math.round(Math.random() * 50)).toFixed(2)),
    }));

    const result = toChartConfig(spec, rows) as ChartConfiguration;

    expect(result.type).toBe('line');
    expect(result.data.labels).toHaveLength(30);
    expect(result.data.datasets[0].data).toHaveLength(30);
    result.data.datasets[0].data.forEach((val) => {
      expect(typeof val).toBe('number');
      expect(val).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('Chart spec integration — pipeline chain', () => {
  it('handles full AIQueryResult → QueryExecutionResult → ChartSpec chain', () => {
    // Simulates the complete flow: pipeline produces AIQueryResult with chartSpec,
    // queryExecutor produces QueryExecutionResult, and toChartConfig consumes both.
    const aiResult: AIQueryResult = {
      sql: 'SELECT p.name, SUM(oi.total) as revenue FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.store_id = $1 GROUP BY p.name ORDER BY revenue DESC LIMIT 10',
      params: ['550e8400-e29b-41d4-a716-446655440000'],
      explanation: 'Top 10 products by revenue',
      chartSpec: {
        type: 'bar',
        title: 'Top Products by Revenue',
        xLabel: 'Product',
        yLabel: 'Revenue ($)',
        dataKey: 'revenue',
        labelKey: 'name',
      },
    };

    const queryResult: QueryExecutionResult = {
      rows: [
        { name: 'Premium Widget', revenue: '4250.00' },
        { name: 'Basic Widget', revenue: '2100.00' },
        { name: 'Pro Gadget', revenue: '1890.50' },
      ],
      rowCount: 3,
      durationMs: 45,
      truncated: false,
    };

    const chartConfig = toChartConfig(aiResult.chartSpec, queryResult.rows);

    expect(chartConfig).not.toBeNull();
    const config = chartConfig as ChartConfiguration;
    expect(config.type).toBe('bar');
    expect(config.data.labels).toEqual(['Premium Widget', 'Basic Widget', 'Pro Gadget']);
    expect(config.data.datasets[0].data).toEqual([4250, 2100, 1890.5]);
    expect(config.options.responsive).toBe(true);
    expect(config.options.plugins.title.text).toBe('Top Products by Revenue');
  });

  it('returns null when pipeline produces null chartSpec (single aggregate)', () => {
    const aiResult: AIQueryResult = {
      sql: "SELECT SUM(total) as total_revenue FROM orders WHERE store_id = $1 AND status = 'completed' LIMIT 100",
      params: ['550e8400-e29b-41d4-a716-446655440000'],
      explanation: 'Total revenue from completed orders',
      chartSpec: null,
    };

    const queryResult: QueryExecutionResult = {
      rows: [{ total_revenue: '45250.00' }],
      rowCount: 1,
      durationMs: 12,
      truncated: false,
    };

    const chartConfig = toChartConfig(aiResult.chartSpec, queryResult.rows);
    expect(chartConfig).toBeNull();
  });

  it('returns null when query returns no rows', () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Revenue by Product',
      xLabel: 'Product',
      yLabel: 'Revenue',
      dataKey: 'revenue',
      labelKey: 'name',
    };

    const queryResult: QueryExecutionResult = {
      rows: [],
      rowCount: 0,
      durationMs: 8,
      truncated: false,
    };

    const chartConfig = toChartConfig(spec, queryResult.rows);
    expect(chartConfig).toBeNull();
  });
});
