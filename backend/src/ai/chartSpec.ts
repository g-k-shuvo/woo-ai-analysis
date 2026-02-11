/**
 * Chart Spec → Chart.js Configuration converter.
 *
 * Takes an AI-generated ChartSpec (chart type, title, keys) plus query result
 * rows and produces a full Chart.js ChartConfiguration object ready for
 * client-side interactive rendering or server-side PNG generation.
 *
 * For "table" type, returns a TableResult with headers + row arrays instead.
 *
 * This is a pure synchronous module with no I/O or external dependencies.
 */

import type {
  ChartSpec,
  ChartConfiguration,
  ChartSpecResult,
  TableResult,
} from './types.js';
import { logger } from '../utils/logger.js';

/**
 * Curated color palette — visually distinct, accessible, and print-friendly.
 * Ordered so adjacent colors have high contrast.
 */
const COLOR_PALETTE = [
  'rgba(54, 162, 235, 0.7)',   // blue
  'rgba(255, 99, 132, 0.7)',   // red
  'rgba(75, 192, 192, 0.7)',   // teal
  'rgba(255, 159, 64, 0.7)',   // orange
  'rgba(153, 102, 255, 0.7)',  // purple
  'rgba(255, 205, 86, 0.7)',   // yellow
  'rgba(201, 203, 207, 0.7)',  // grey
  'rgba(46, 204, 113, 0.7)',   // green
  'rgba(231, 76, 60, 0.7)',    // dark red
  'rgba(52, 73, 94, 0.7)',     // dark blue-grey
  'rgba(26, 188, 156, 0.7)',   // turquoise
  'rgba(241, 196, 15, 0.7)',   // gold
];

const BORDER_PALETTE = COLOR_PALETTE.map((c) => c.replace('0.7)', '1)'));

/**
 * Generate an array of colors for `count` data points by cycling the palette.
 */
export function generateColors(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(COLOR_PALETTE[i % COLOR_PALETTE.length]);
  }
  return colors;
}

/**
 * Generate border colors that match the fill palette but fully opaque.
 */
export function generateBorderColors(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(BORDER_PALETTE[i % BORDER_PALETTE.length]);
  }
  return colors;
}

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
 * Convert a ChartSpec + query result rows into a full Chart.js configuration.
 *
 * Returns null when:
 * - spec is null (simple aggregates with no chart)
 * - rows is empty (nothing to visualise)
 * - dataKey or labelKey do not exist in the first row
 */
export function toChartConfig(
  spec: ChartSpec | null,
  rows: Record<string, unknown>[],
): ChartSpecResult | null {
  if (!spec) {
    return null;
  }

  if (!rows || rows.length === 0) {
    logger.warn({ chartType: spec.type }, 'Chart spec: no rows to chart');
    return null;
  }

  const firstRow = rows[0];
  const rowKeys = Object.keys(firstRow);

  // Validate dataKey exists in result rows
  if (!rowKeys.includes(spec.dataKey)) {
    logger.warn(
      { dataKey: spec.dataKey, availableKeys: rowKeys },
      'Chart spec: dataKey not found in result rows',
    );
    return null;
  }

  // Validate labelKey exists in result rows
  if (!rowKeys.includes(spec.labelKey)) {
    logger.warn(
      { labelKey: spec.labelKey, availableKeys: rowKeys },
      'Chart spec: labelKey not found in result rows',
    );
    return null;
  }

  // Table type: return structured table representation
  if (spec.type === 'table') {
    return buildTableResult(spec, rows);
  }

  // Chart types: bar, line, pie, doughnut
  const labels = rows.map((row) => toLabel(row[spec.labelKey]));
  const data = rows.map((row) => toNumber(row[spec.dataKey]));
  const count = data.length;

  if (spec.type === 'pie' || spec.type === 'doughnut') {
    return buildPieConfig(spec, labels, data, count);
  }

  // bar or line
  return buildAxisConfig(spec, labels, data, count);
}

function buildTableResult(
  spec: ChartSpec,
  rows: Record<string, unknown>[],
): TableResult {
  const headers = Object.keys(rows[0]);
  const tableRows = rows.map((row) => headers.map((h) => row[h]));

  return {
    type: 'table',
    title: spec.title,
    headers,
    rows: tableRows,
  };
}

function buildPieConfig(
  spec: ChartSpec,
  labels: string[],
  data: number[],
  count: number,
): ChartConfiguration {
  return {
    type: spec.type as 'pie' | 'doughnut',
    data: {
      labels,
      datasets: [
        {
          label: spec.title,
          data,
          backgroundColor: generateColors(count),
          borderColor: generateBorderColors(count),
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: spec.title },
        legend: { display: true, position: 'right' },
      },
    },
  };
}

function buildAxisConfig(
  spec: ChartSpec,
  labels: string[],
  data: number[],
  count: number,
): ChartConfiguration {
  const dataset: ChartConfiguration['data']['datasets'][0] = {
    label: spec.title,
    data,
    backgroundColor: generateColors(count),
    borderColor: generateBorderColors(count),
    borderWidth: 1,
  };

  return {
    type: spec.type as 'bar' | 'line',
    data: {
      labels,
      datasets: [dataset],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: spec.title },
      },
      scales: {
        x: { title: { display: true, text: spec.xLabel ?? spec.labelKey } },
        y: { title: { display: true, text: spec.yLabel ?? spec.dataKey } },
      },
    },
  };
}
