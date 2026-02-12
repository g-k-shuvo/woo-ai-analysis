/**
 * Chart Type Converter — switches between chart types for the same data.
 *
 * Takes an existing ChartSpecResult, the original query rows, and a target
 * chart type, then produces a new ChartSpecResult configured for that type.
 *
 * This is a pure synchronous module with no I/O or external dependencies.
 */

import type {
  ChartConfiguration,
  ChartMeta,
  ChartSpecResult,
  TableResult,
} from './types.js';
import { generateColors, generateBorderColors } from './chartSpec.js';
import { logger } from '../utils/logger.js';

type ChartType = 'bar' | 'line' | 'pie' | 'doughnut' | 'table';

/**
 * Coerce a value to a number. Returns 0 for non-numeric / null / undefined.
 */
function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Coerce a value to a display string for chart labels.
 */
function toLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/**
 * Type guard: returns true if the ChartSpecResult is a TableResult.
 */
function isTableResult(config: ChartSpecResult): config is TableResult {
  return (config as TableResult).type === 'table';
}

/**
 * Convert an existing ChartSpecResult to a different chart type.
 *
 * @param currentConfig - The current chart config to convert from
 * @param rows - The original query result rows (needed for table↔chart conversion)
 * @param targetType - The target chart type
 * @param meta - Metadata about the data keys (needed for table→chart conversion)
 * @returns A new ChartSpecResult for the target type, or the original if conversion is not possible
 */
export function convertChartType(
  currentConfig: ChartSpecResult,
  rows: Record<string, unknown>[],
  targetType: ChartType,
  meta: ChartMeta & { title: string },
): ChartSpecResult {
  if (!currentConfig) {
    logger.warn('convertChartType: currentConfig is null');
    return currentConfig;
  }

  // Same type → return as-is
  if (currentConfig.type === targetType) {
    return currentConfig;
  }

  // Target is table → build TableResult from rows
  if (targetType === 'table') {
    return buildTableFromRows(rows, meta.title);
  }

  // Source is table → build chart from rows + meta
  if (isTableResult(currentConfig)) {
    return buildChartFromRows(rows, targetType, meta);
  }

  // Chart → chart conversion
  return convertBetweenChartTypes(currentConfig, targetType, meta.title);
}

/**
 * Build a TableResult from raw rows.
 */
function buildTableFromRows(
  rows: Record<string, unknown>[],
  title: string,
): TableResult {
  if (!rows || rows.length === 0) {
    return {
      type: 'table',
      title,
      headers: [],
      rows: [],
    };
  }

  const headers = Object.keys(rows[0]);
  const tableRows = rows.map((row) => headers.map((h) => row[h]));

  return {
    type: 'table',
    title,
    headers,
    rows: tableRows,
  };
}

/**
 * Build a ChartConfiguration from raw rows + meta.
 */
function buildChartFromRows(
  rows: Record<string, unknown>[],
  targetType: 'bar' | 'line' | 'pie' | 'doughnut',
  meta: ChartMeta & { title: string },
): ChartConfiguration {
  const labels = rows.map((row) => toLabel(row[meta.labelKey]));
  const data = rows.map((row) => toNumber(row[meta.dataKey]));
  const count = data.length;

  if (targetType === 'pie' || targetType === 'doughnut') {
    return buildPieConfig(targetType, labels, data, count, meta.title);
  }

  return buildAxisConfig(targetType, labels, data, count, meta);
}

/**
 * Convert between chart types (bar, line, pie, doughnut).
 * Reuses labels and data from the existing chart config.
 */
function convertBetweenChartTypes(
  source: ChartConfiguration,
  targetType: 'bar' | 'line' | 'pie' | 'doughnut',
  title: string,
): ChartConfiguration {
  const labels = source.data.labels;
  const data = source.data.datasets[0].data;
  const count = data.length;

  if (targetType === 'pie' || targetType === 'doughnut') {
    return buildPieConfig(targetType, labels, data, count, title);
  }

  // For bar/line, try to reuse axis labels from source if available
  const xText = source.options.scales?.x?.title?.text;
  const yText = source.options.scales?.y?.title?.text;
  const meta: ChartMeta & { title: string } = {
    title,
    dataKey: yText ?? '',
    labelKey: xText ?? '',
    xLabel: xText,
    yLabel: yText,
  };

  return buildAxisConfig(targetType, labels, data, count, meta);
}

function buildPieConfig(
  type: 'pie' | 'doughnut',
  labels: string[],
  data: number[],
  count: number,
  title: string,
): ChartConfiguration {
  return {
    type,
    data: {
      labels,
      datasets: [{
        label: title,
        data,
        backgroundColor: generateColors(count),
        borderColor: generateBorderColors(count),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: title },
        legend: { display: true, position: 'right' },
      },
    },
  };
}

function buildAxisConfig(
  type: 'bar' | 'line',
  labels: string[],
  data: number[],
  count: number,
  meta: ChartMeta & { title: string },
): ChartConfiguration {
  return {
    type,
    data: {
      labels,
      datasets: [{
        label: meta.title,
        data,
        backgroundColor: generateColors(count),
        borderColor: generateBorderColors(count),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: meta.title },
      },
      scales: {
        x: { title: { display: true, text: meta.xLabel ?? meta.labelKey } },
        y: { title: { display: true, text: meta.yLabel ?? meta.dataKey } },
      },
    },
  };
}
