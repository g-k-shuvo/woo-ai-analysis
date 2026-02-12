/**
 * Server-side chart renderer — ChartConfiguration → PNG buffer.
 *
 * Uses chartjs-node-canvas to render Chart.js charts to PNG images on the
 * server. Produces base64 data URIs suitable for embedding in API responses,
 * emails, and PDF exports.
 *
 * The renderer instance is created once and reused for all renders to avoid
 * the overhead of re-initialising the canvas each time.
 */

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration as NativeChartConfiguration } from 'chart.js';
import type {
  ChartConfiguration,
  ChartRenderOptions,
  ChartSpecResult,
  TableResult,
} from '../ai/types.js';
import { logger } from '../utils/logger.js';

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 400;
const DEFAULT_BACKGROUND = 'white';

/**
 * Type guard: returns true if the ChartSpecResult is a TableResult.
 */
function isTableResult(config: ChartSpecResult): config is TableResult {
  return (config as TableResult).type === 'table';
}

/**
 * Convert our simplified ChartConfiguration to the native chart.js format.
 * Our type is a strict subset, so this is a safe cast with minor adjustments.
 */
function toNativeConfig(config: ChartConfiguration): NativeChartConfiguration {
  // Server-side rendering: animation must be disabled, responsive is irrelevant
  return {
    type: config.type,
    data: config.data,
    options: {
      ...config.options,
      responsive: false,
      animation: false as unknown as undefined,
      plugins: {
        ...config.options.plugins,
        legend: config.options.plugins.legend
          ? {
              display: config.options.plugins.legend.display,
              position: config.options.plugins.legend.position as 'right' | 'top' | 'bottom' | 'left',
            }
          : undefined,
      },
    },
  } as NativeChartConfiguration;
}

export interface ChartRenderer {
  renderToBuffer(config: ChartSpecResult): Promise<Buffer | null>;
  renderToDataURI(config: ChartSpecResult): Promise<string | null>;
}

export function createChartRenderer(options: ChartRenderOptions = {}): ChartRenderer {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const backgroundColour = options.backgroundColour ?? DEFAULT_BACKGROUND;

  const canvasRenderer = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour,
  });

  async function renderToBuffer(config: ChartSpecResult): Promise<Buffer | null> {
    if (!config) {
      return null;
    }

    if (isTableResult(config)) {
      logger.info('Chart renderer: skipping table-type config');
      return null;
    }

    try {
      const nativeConfig = toNativeConfig(config);
      const buffer = await canvasRenderer.renderToBuffer(nativeConfig);

      logger.info(
        { chartType: config.type, bufferSize: buffer.length },
        'Chart renderer: rendered PNG',
      );

      return buffer;
    } catch (err) {
      logger.error(
        { err, chartType: config.type },
        'Chart renderer: failed to render chart',
      );
      return null;
    }
  }

  async function renderToDataURI(config: ChartSpecResult): Promise<string | null> {
    const buffer = await renderToBuffer(config);
    if (!buffer) {
      return null;
    }

    const base64 = buffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  }

  return { renderToBuffer, renderToDataURI };
}
