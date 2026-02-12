import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ChartConfiguration, TableResult, ChartSpecResult } from '../../../src/ai/types.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Mock chartjs-node-canvas ────────────────────────────────────────

const mockRenderToBuffer = jest.fn<(config: unknown) => Promise<Buffer>>();
const mockRenderToDataURL = jest.fn<(config: unknown) => Promise<string>>();

jest.unstable_mockModule('chartjs-node-canvas', () => ({
  ChartJSNodeCanvas: jest.fn().mockImplementation(() => ({
    renderToBuffer: mockRenderToBuffer,
    renderToDataURL: mockRenderToDataURL,
  })),
}));

// ── Import after mocks ─────────────────────────────────────────────

const { createChartRenderer } = await import('../../../src/services/chartRenderer.js');
const { ChartJSNodeCanvas } = await import('chartjs-node-canvas');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ─────────────────────────────────────────────────────────

function makeBarConfig(): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: ['Product 1', 'Product 2', 'Product 3'],
      datasets: [{
        label: 'Revenue by Product',
        data: [100, 200, 300],
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

function makeLineConfig(): ChartConfiguration {
  return {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar'],
      datasets: [{
        label: 'Monthly Revenue',
        data: [1000, 1500, 1200],
        backgroundColor: ['rgba(54,162,235,0.7)'],
        borderColor: ['rgba(54,162,235,1)'],
        borderWidth: 2,
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
        backgroundColor: ['rgba(54,162,235,0.7)', 'rgba(255,99,132,0.7)', 'rgba(75,192,192,0.7)'],
        borderColor: ['rgba(54,162,235,1)', 'rgba(255,99,132,1)', 'rgba(75,192,192,1)'],
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
        backgroundColor: ['rgba(75,192,192,0.7)', 'rgba(255,205,86,0.7)', 'rgba(255,99,132,0.7)'],
        borderColor: ['rgba(75,192,192,1)', 'rgba(255,205,86,1)', 'rgba(255,99,132,1)'],
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
    title: 'Top Customers',
    headers: ['name', 'total_spent'],
    rows: [['Alice', 500], ['Bob', 300]],
  };
}

const FAKE_PNG_BUFFER = Buffer.from('fakePNG', 'utf-8');

// ── Tests ───────────────────────────────────────────────────────────

describe('chartRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRenderToBuffer.mockResolvedValue(FAKE_PNG_BUFFER);
  });

  // ── createChartRenderer factory ─────────────────────────────────

  describe('createChartRenderer()', () => {
    it('creates a ChartJSNodeCanvas with default dimensions', () => {
      createChartRenderer();

      expect(ChartJSNodeCanvas).toHaveBeenCalledWith({
        width: 800,
        height: 400,
        backgroundColour: 'white',
      });
    });

    it('creates a ChartJSNodeCanvas with custom dimensions', () => {
      createChartRenderer({ width: 1200, height: 600 });

      expect(ChartJSNodeCanvas).toHaveBeenCalledWith({
        width: 1200,
        height: 600,
        backgroundColour: 'white',
      });
    });

    it('creates a ChartJSNodeCanvas with custom background colour', () => {
      createChartRenderer({ backgroundColour: '#f0f0f0' });

      expect(ChartJSNodeCanvas).toHaveBeenCalledWith({
        width: 800,
        height: 400,
        backgroundColour: '#f0f0f0',
      });
    });

    it('returns an object with renderToBuffer and renderToDataURI methods', () => {
      const renderer = createChartRenderer();

      expect(renderer).toHaveProperty('renderToBuffer');
      expect(typeof renderer.renderToBuffer).toBe('function');
      expect(renderer).toHaveProperty('renderToDataURI');
      expect(typeof renderer.renderToDataURI).toBe('function');
    });
  });

  // ── renderToBuffer() ────────────────────────────────────────────

  describe('renderToBuffer()', () => {
    it('returns a PNG buffer for a bar chart config', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToBuffer(makeBarConfig());

      expect(result).toBe(FAKE_PNG_BUFFER);
      expect(mockRenderToBuffer).toHaveBeenCalledTimes(1);
    });

    it('returns a PNG buffer for a line chart config', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToBuffer(makeLineConfig());

      expect(result).toBe(FAKE_PNG_BUFFER);
      expect(mockRenderToBuffer).toHaveBeenCalledTimes(1);
    });

    it('returns a PNG buffer for a pie chart config', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToBuffer(makePieConfig());

      expect(result).toBe(FAKE_PNG_BUFFER);
      expect(mockRenderToBuffer).toHaveBeenCalledTimes(1);
    });

    it('returns a PNG buffer for a doughnut chart config', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToBuffer(makeDoughnutConfig());

      expect(result).toBe(FAKE_PNG_BUFFER);
      expect(mockRenderToBuffer).toHaveBeenCalledTimes(1);
    });

    it('returns null for a table-type config', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToBuffer(makeTableResult());

      expect(result).toBeNull();
      expect(mockRenderToBuffer).not.toHaveBeenCalled();
    });

    it('logs info when skipping table type', async () => {
      const renderer = createChartRenderer();

      await renderer.renderToBuffer(makeTableResult());

      expect(logger.info).toHaveBeenCalledWith('Chart renderer: skipping table-type config');
    });

    it('returns null when renderToBuffer is called with null config', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToBuffer(null as unknown as ChartSpecResult);

      expect(result).toBeNull();
    });

    it('passes native config with responsive: false and animation disabled', async () => {
      const renderer = createChartRenderer();
      const barConfig = makeBarConfig();

      await renderer.renderToBuffer(barConfig);

      const passedConfig = (mockRenderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      const options = passedConfig.options as Record<string, unknown>;
      expect(options.responsive).toBe(false);
      expect(options.animation).toBe(false);
    });

    it('logs chart type and buffer size on success', async () => {
      const renderer = createChartRenderer();

      await renderer.renderToBuffer(makeBarConfig());

      expect(logger.info).toHaveBeenCalledWith(
        { chartType: 'bar', bufferSize: FAKE_PNG_BUFFER.length },
        'Chart renderer: rendered PNG',
      );
    });

    it('returns null and logs error when rendering fails', async () => {
      const renderError = new Error('Canvas rendering failed');
      mockRenderToBuffer.mockRejectedValue(renderError);
      const renderer = createChartRenderer();

      const result = await renderer.renderToBuffer(makeBarConfig());

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        { err: renderError, chartType: 'bar' },
        'Chart renderer: failed to render chart',
      );
    });

    it('does not throw when rendering fails', async () => {
      mockRenderToBuffer.mockRejectedValue(new Error('Canvas crash'));
      const renderer = createChartRenderer();

      await expect(renderer.renderToBuffer(makeBarConfig())).resolves.toBeNull();
    });
  });

  // ── renderToDataURI() ───────────────────────────────────────────

  describe('renderToDataURI()', () => {
    it('returns a base64 data URI string for a bar chart', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToDataURI(makeBarConfig());

      expect(result).toBe(`data:image/png;base64,${FAKE_PNG_BUFFER.toString('base64')}`);
    });

    it('returns a base64 data URI starting with the expected prefix', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToDataURI(makeBarConfig());

      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('returns null for a table-type config', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToDataURI(makeTableResult());

      expect(result).toBeNull();
    });

    it('returns null when renderToBuffer fails', async () => {
      mockRenderToBuffer.mockRejectedValue(new Error('Render error'));
      const renderer = createChartRenderer();

      const result = await renderer.renderToDataURI(makeBarConfig());

      expect(result).toBeNull();
    });

    it('returns null when config is null', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToDataURI(null as unknown as ChartSpecResult);

      expect(result).toBeNull();
    });

    it('produces correct base64 encoding of the buffer', async () => {
      const specificBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG magic bytes
      mockRenderToBuffer.mockResolvedValue(specificBuffer);
      const renderer = createChartRenderer();

      const result = await renderer.renderToDataURI(makeBarConfig());

      const expectedBase64 = specificBuffer.toString('base64');
      expect(result).toBe(`data:image/png;base64,${expectedBase64}`);
    });

    it('works with line chart configs', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToDataURI(makeLineConfig());

      expect(result).not.toBeNull();
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it('works with pie chart configs', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToDataURI(makePieConfig());

      expect(result).not.toBeNull();
    });

    it('works with doughnut chart configs', async () => {
      const renderer = createChartRenderer();

      const result = await renderer.renderToDataURI(makeDoughnutConfig());

      expect(result).not.toBeNull();
    });
  });

  // ── native config conversion ────────────────────────────────────

  describe('native config conversion', () => {
    it('preserves chart type in native config', async () => {
      const renderer = createChartRenderer();

      await renderer.renderToBuffer(makeBarConfig());

      const passedConfig = (mockRenderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      expect(passedConfig.type).toBe('bar');
    });

    it('preserves data labels in native config', async () => {
      const renderer = createChartRenderer();
      const config = makeBarConfig();

      await renderer.renderToBuffer(config);

      const passedConfig = (mockRenderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      const data = passedConfig.data as Record<string, unknown>;
      expect(data.labels).toEqual(config.data.labels);
    });

    it('preserves datasets in native config', async () => {
      const renderer = createChartRenderer();
      const config = makeBarConfig();

      await renderer.renderToBuffer(config);

      const passedConfig = (mockRenderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      const data = passedConfig.data as Record<string, unknown>;
      expect(data.datasets).toEqual(config.data.datasets);
    });

    it('preserves title plugin in native config', async () => {
      const renderer = createChartRenderer();

      await renderer.renderToBuffer(makeBarConfig());

      const passedConfig = (mockRenderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      const options = passedConfig.options as Record<string, unknown>;
      const plugins = options.plugins as Record<string, unknown>;
      const title = plugins.title as Record<string, unknown>;
      expect(title.display).toBe(true);
      expect(title.text).toBe('Revenue by Product');
    });

    it('converts legend position to valid chart.js value', async () => {
      const renderer = createChartRenderer();

      await renderer.renderToBuffer(makePieConfig());

      const passedConfig = (mockRenderToBuffer.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      const options = passedConfig.options as Record<string, unknown>;
      const plugins = options.plugins as Record<string, unknown>;
      const legend = plugins.legend as Record<string, unknown>;
      expect(legend.display).toBe(true);
      expect(legend.position).toBe('right');
    });
  });
});
