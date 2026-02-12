import { jest, describe, it, expect } from '@jest/globals';
import type {
  ChartSpec,
  ChartConfiguration,
  TableResult,
} from '../../src/ai/types.js';

/**
 * Integration tests for the server-side chart renderer.
 *
 * These tests exercise the full rendering pipeline: ChartConfiguration →
 * chartjs-node-canvas → PNG buffer / data URI. They use the real
 * chartjs-node-canvas library (not mocked) to verify that:
 * - Valid PNG buffers are produced
 * - Data URIs have the correct format
 * - Different chart types all render successfully
 * - The integration with toChartConfig produces renderable configs
 */

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createChartRenderer } = await import('../../src/services/chartRenderer.js');
const { toChartConfig } = await import('../../src/ai/chartSpec.js');

// ── PNG magic bytes for validation ──────────────────────────────

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// ── Helpers ─────────────────────────────────────────────────────

function makeBarChartConfig(): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: ['Product A', 'Product B', 'Product C'],
      datasets: [{
        label: 'Revenue by Product',
        data: [1500, 2300, 900],
        backgroundColor: ['rgba(54,162,235,0.7)', 'rgba(255,99,132,0.7)', 'rgba(75,192,192,0.7)'],
        borderColor: ['rgba(54,162,235,1)', 'rgba(255,99,132,1)', 'rgba(75,192,192,1)'],
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

function makeLineChartConfig(): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      datasets: [{
        label: 'Monthly Revenue Trend',
        data: [8000, 9500, 7200, 11000, 10500],
        backgroundColor: ['rgba(54,162,235,0.7)'],
        borderColor: ['rgba(54,162,235,1)'],
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Revenue Trend' },
      },
      scales: {
        x: { title: { display: true, text: 'Month' } },
        y: { title: { display: true, text: 'Revenue ($)' } },
      },
    },
  };
}

function makePieChartConfig(): ChartConfiguration {
  return {
    type: 'pie',
    data: {
      labels: ['Electronics', 'Clothing', 'Home & Garden', 'Books'],
      datasets: [{
        label: 'Revenue by Category',
        data: [4500, 2800, 1900, 800],
        backgroundColor: [
          'rgba(54,162,235,0.7)', 'rgba(255,99,132,0.7)',
          'rgba(75,192,192,0.7)', 'rgba(255,159,64,0.7)',
        ],
        borderColor: [
          'rgba(54,162,235,1)', 'rgba(255,99,132,1)',
          'rgba(75,192,192,1)', 'rgba(255,159,64,1)',
        ],
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

function makeDoughnutChartConfig(): ChartConfiguration {
  return {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Processing', 'Pending', 'Cancelled'],
      datasets: [{
        label: 'Order Status',
        data: [120, 35, 20, 8],
        backgroundColor: [
          'rgba(75,192,192,0.7)', 'rgba(54,162,235,0.7)',
          'rgba(255,205,86,0.7)', 'rgba(255,99,132,0.7)',
        ],
        borderColor: [
          'rgba(75,192,192,1)', 'rgba(54,162,235,1)',
          'rgba(255,205,86,1)', 'rgba(255,99,132,1)',
        ],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Order Status Breakdown' },
        legend: { display: true, position: 'right' },
      },
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('Chart renderer integration — real rendering', () => {
  const renderer = createChartRenderer({ width: 400, height: 200 });

  // ── Bar chart ───────────────────────────────────────────────

  describe('bar chart rendering', () => {
    it('produces a valid PNG buffer', async () => {
      const config = makeBarChartConfig();
      const buffer = await renderer.renderToBuffer(config);

      expect(buffer).not.toBeNull();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer!.subarray(0, 8)).toEqual(PNG_MAGIC);
    });

    it('produces a buffer with reasonable size', async () => {
      const config = makeBarChartConfig();
      const buffer = await renderer.renderToBuffer(config);

      expect(buffer!.length).toBeGreaterThan(100);
      expect(buffer!.length).toBeLessThan(500000); // should be under 500KB
    });

    it('produces a valid data URI', async () => {
      const config = makeBarChartConfig();
      const dataURI = await renderer.renderToDataURI(config);

      expect(dataURI).not.toBeNull();
      expect(dataURI).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
    });
  });

  // ── Line chart ──────────────────────────────────────────────

  describe('line chart rendering', () => {
    it('produces a valid PNG buffer', async () => {
      const config = makeLineChartConfig();
      const buffer = await renderer.renderToBuffer(config);

      expect(buffer).not.toBeNull();
      expect(buffer!.subarray(0, 8)).toEqual(PNG_MAGIC);
    });

    it('produces a valid data URI', async () => {
      const config = makeLineChartConfig();
      const dataURI = await renderer.renderToDataURI(config);

      expect(dataURI).toMatch(/^data:image\/png;base64,/);
    });
  });

  // ── Pie chart ───────────────────────────────────────────────

  describe('pie chart rendering', () => {
    it('produces a valid PNG buffer', async () => {
      const config = makePieChartConfig();
      const buffer = await renderer.renderToBuffer(config);

      expect(buffer).not.toBeNull();
      expect(buffer!.subarray(0, 8)).toEqual(PNG_MAGIC);
    });

    it('produces a valid data URI', async () => {
      const config = makePieChartConfig();
      const dataURI = await renderer.renderToDataURI(config);

      expect(dataURI).toMatch(/^data:image\/png;base64,/);
    });
  });

  // ── Doughnut chart ──────────────────────────────────────────

  describe('doughnut chart rendering', () => {
    it('produces a valid PNG buffer', async () => {
      const config = makeDoughnutChartConfig();
      const buffer = await renderer.renderToBuffer(config);

      expect(buffer).not.toBeNull();
      expect(buffer!.subarray(0, 8)).toEqual(PNG_MAGIC);
    });

    it('produces a valid data URI', async () => {
      const config = makeDoughnutChartConfig();
      const dataURI = await renderer.renderToDataURI(config);

      expect(dataURI).toMatch(/^data:image\/png;base64,/);
    });
  });

  // ── Table type ──────────────────────────────────────────────

  describe('table-type config', () => {
    it('returns null buffer for table configs', async () => {
      const tableResult: TableResult = {
        type: 'table',
        title: 'Top Customers',
        headers: ['name', 'total_spent'],
        rows: [['Alice', 500], ['Bob', 300]],
      };

      const buffer = await renderer.renderToBuffer(tableResult);

      expect(buffer).toBeNull();
    });

    it('returns null data URI for table configs', async () => {
      const tableResult: TableResult = {
        type: 'table',
        title: 'Recent Orders',
        headers: ['order_id', 'total', 'status'],
        rows: [[1001, 45.99, 'completed'], [1002, 89.50, 'processing']],
      };

      const dataURI = await renderer.renderToDataURI(tableResult);

      expect(dataURI).toBeNull();
    });
  });
});

// ── End-to-end: toChartConfig → renderToBuffer ──────────────────

describe('Chart renderer integration — chartSpec → render pipeline', () => {
  const renderer = createChartRenderer({ width: 400, height: 200 });

  it('renders a bar chart from realistic revenue query output', async () => {
    const spec: ChartSpec = {
      type: 'bar',
      title: 'Monthly Revenue',
      xLabel: 'Month',
      yLabel: 'Revenue ($)',
      dataKey: 'total_revenue',
      labelKey: 'month',
    };
    const rows: Record<string, unknown>[] = [
      { month: '2026-01', total_revenue: '12450.50' },
      { month: '2026-02', total_revenue: '15320.00' },
    ];

    const chartConfig = toChartConfig(spec, rows);
    expect(chartConfig).not.toBeNull();

    const buffer = await renderer.renderToBuffer(chartConfig!);
    expect(buffer).not.toBeNull();
    expect(buffer!.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('renders a pie chart from realistic category query output', async () => {
    const spec: ChartSpec = {
      type: 'pie',
      title: 'Revenue by Category',
      dataKey: 'revenue',
      labelKey: 'category_name',
    };
    const rows: Record<string, unknown>[] = [
      { category_name: 'Electronics', revenue: '5000' },
      { category_name: 'Clothing', revenue: '3200' },
      { category_name: 'Home', revenue: '1800' },
    ];

    const chartConfig = toChartConfig(spec, rows);
    expect(chartConfig).not.toBeNull();

    const dataURI = await renderer.renderToDataURI(chartConfig!);
    expect(dataURI).toMatch(/^data:image\/png;base64,/);
  });

  it('renders a line chart from realistic trend query output', async () => {
    const spec: ChartSpec = {
      type: 'line',
      title: 'Daily Orders',
      xLabel: 'Date',
      yLabel: 'Orders',
      dataKey: 'order_count',
      labelKey: 'date',
    };
    const rows: Record<string, unknown>[] = [
      { date: '2026-02-01', order_count: 15 },
      { date: '2026-02-02', order_count: 22 },
      { date: '2026-02-03', order_count: 18 },
      { date: '2026-02-04', order_count: 30 },
    ];

    const chartConfig = toChartConfig(spec, rows);
    expect(chartConfig).not.toBeNull();

    const buffer = await renderer.renderToBuffer(chartConfig!);
    expect(buffer).not.toBeNull();
    expect(buffer!.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('renders a doughnut chart from realistic status query output', async () => {
    const spec: ChartSpec = {
      type: 'doughnut',
      title: 'Order Status',
      dataKey: 'count',
      labelKey: 'status',
    };
    const rows: Record<string, unknown>[] = [
      { status: 'completed', count: 85 },
      { status: 'processing', count: 10 },
      { status: 'pending', count: 5 },
    ];

    const chartConfig = toChartConfig(spec, rows);
    expect(chartConfig).not.toBeNull();

    const buffer = await renderer.renderToBuffer(chartConfig!);
    expect(buffer).not.toBeNull();
  });

  it('returns null for table spec (no image rendering for tables)', async () => {
    const spec: ChartSpec = {
      type: 'table',
      title: 'Top Products',
      dataKey: 'revenue',
      labelKey: 'name',
    };
    const rows: Record<string, unknown>[] = [
      { name: 'Widget', revenue: 500 },
      { name: 'Gadget', revenue: 300 },
    ];

    const chartConfig = toChartConfig(spec, rows);
    expect(chartConfig).not.toBeNull();

    const buffer = await renderer.renderToBuffer(chartConfig!);
    expect(buffer).toBeNull();
  });
});

// ── Custom dimensions ───────────────────────────────────────────

describe('Chart renderer integration — custom dimensions', () => {
  it('renders with custom width and height', async () => {
    const renderer = createChartRenderer({ width: 1200, height: 600 });
    const config = makeBarChartConfig();

    const buffer = await renderer.renderToBuffer(config);

    expect(buffer).not.toBeNull();
    expect(buffer!.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('renders with small dimensions', async () => {
    const renderer = createChartRenderer({ width: 200, height: 100 });
    const config = makeBarChartConfig();

    const buffer = await renderer.renderToBuffer(config);

    expect(buffer).not.toBeNull();
    expect(buffer!.subarray(0, 8)).toEqual(PNG_MAGIC);
  });
});

// ── Data URI roundtrip ──────────────────────────────────────────

describe('Chart renderer integration — data URI format', () => {
  const renderer = createChartRenderer({ width: 400, height: 200 });

  it('data URI decodes back to a valid PNG', async () => {
    const config = makeBarChartConfig();
    const dataURI = await renderer.renderToDataURI(config);

    expect(dataURI).not.toBeNull();

    // Strip prefix and decode
    const base64Part = dataURI!.replace('data:image/png;base64,', '');
    const decoded = Buffer.from(base64Part, 'base64');

    expect(decoded.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('data URI base64 is properly padded', async () => {
    const config = makePieChartConfig();
    const dataURI = await renderer.renderToDataURI(config);

    expect(dataURI).not.toBeNull();

    const base64Part = dataURI!.replace('data:image/png;base64,', '');
    // Base64 length should be a multiple of 4
    expect(base64Part.length % 4).toBe(0);
  });
});
