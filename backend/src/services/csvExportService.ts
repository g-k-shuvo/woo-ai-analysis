import type { Knex } from 'knex';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const MAX_TITLE_LENGTH = 255;
const UTF8_BOM = '\uFEFF';

export interface CsvExportServiceDeps {
  db: Knex;
}

interface ChartRecord {
  id: string;
  store_id: string;
  title: string;
  chart_config: string | Record<string, unknown>;
  position_index: number;
}

interface ChartDataset {
  label?: string;
  data?: unknown[];
}

interface ChartConfig {
  type?: string;
  data?: {
    labels?: unknown[];
    datasets?: ChartDataset[];
  };
}

function parseChartConfig(raw: unknown): ChartConfig {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ChartConfig;
    } catch {
      return {};
    }
  }
  return (raw as ChartConfig) ?? {};
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // If the value contains commas, quotes, or newlines, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function chartToCsvRows(config: ChartConfig): string[][] {
  const data = config.data;
  if (!data) {
    return [];
  }

  const labels = data.labels ?? [];
  const datasets = data.datasets ?? [];

  if (labels.length === 0 && datasets.length === 0) {
    return [];
  }

  // Build header row: first column is "Label", then one column per dataset
  const headerRow = ['Label', ...datasets.map((ds) => ds.label ?? 'Value')];

  // Build data rows: one row per label
  const dataRows: string[][] = [];
  const rowCount = Math.max(labels.length, ...datasets.map((ds) => ds.data?.length ?? 0));

  for (let i = 0; i < rowCount; i++) {
    const row: string[] = [
      i < labels.length ? String(labels[i] ?? '') : '',
      ...datasets.map((ds) => {
        const val = ds.data?.[i];
        return val !== null && val !== undefined ? String(val) : '';
      }),
    ];
    dataRows.push(row);
  }

  return [headerRow, ...dataRows];
}

function rowsToCsvString(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
}

export function createCsvExportService(deps: CsvExportServiceDeps) {
  const { db } = deps;

  async function exportCsv(storeId: string, chartId?: string): Promise<string> {
    if (chartId) {
      return exportSingleChart(storeId, chartId);
    }
    return exportAllCharts(storeId);
  }

  async function exportSingleChart(storeId: string, chartId: string): Promise<string> {
    if (chartId.length > MAX_TITLE_LENGTH) {
      throw new ValidationError('Invalid chart ID');
    }

    const chart = await db('saved_charts')
      .where({ id: chartId, store_id: storeId })
      .first<ChartRecord | undefined>();

    if (!chart) {
      throw new NotFoundError('Chart not found');
    }

    const config = parseChartConfig(chart.chart_config);
    const rows = chartToCsvRows(config);

    if (rows.length === 0) {
      throw new ValidationError('Chart has no exportable data');
    }

    const csvContent = UTF8_BOM + rowsToCsvString(rows);

    logger.info({ storeId, chartId, rowCount: rows.length - 1 }, 'CSV exported for single chart');
    return csvContent;
  }

  async function exportAllCharts(storeId: string): Promise<string> {
    const charts = await db('saved_charts')
      .where({ store_id: storeId })
      .orderBy('position_index', 'asc')
      .select<ChartRecord[]>('id', 'title', 'chart_config', 'position_index');

    if (charts.length === 0) {
      throw new ValidationError('No saved charts to export. Save some charts to your dashboard first.');
    }

    const sections: string[] = [];

    for (const chart of charts) {
      const config = parseChartConfig(chart.chart_config);
      const rows = chartToCsvRows(config);

      if (rows.length === 0) {
        continue;
      }

      // Add chart title as section header
      const titleRow = escapeCsvValue(chart.title);
      const csvSection = titleRow + '\r\n' + rowsToCsvString(rows);
      sections.push(csvSection);
    }

    if (sections.length === 0) {
      throw new ValidationError('No charts with exportable data found.');
    }

    // Join sections with a blank line separator
    const csvContent = UTF8_BOM + sections.join('\r\n\r\n');

    logger.info({ storeId, chartCount: sections.length }, 'CSV exported for all charts');
    return csvContent;
  }

  return {
    exportCsv,
  };
}

export type CsvExportService = ReturnType<typeof createCsvExportService>;
