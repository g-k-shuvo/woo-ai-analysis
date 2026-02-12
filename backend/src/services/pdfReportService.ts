import type { Knex } from 'knex';
import PDFDocument from 'pdfkit';
import type { ChartRenderer } from './chartRenderer.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const MAX_REPORTS_PER_STORE = 10;
const MAX_TITLE_LENGTH = 255;

export interface ReportRecord {
  id: string;
  store_id: string;
  title: string;
  status: string;
  chart_count: number;
  file_data: string | null;
  created_at: string;
}

export interface ReportResponse {
  id: string;
  title: string;
  status: string;
  chartCount: number;
  createdAt: string;
}

export interface PdfReportServiceDeps {
  db: Knex;
  chartRenderer: ChartRenderer;
}

function toResponse(record: ReportRecord): ReportResponse {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    chartCount: record.chart_count,
    createdAt: record.created_at,
  };
}

export function createPdfReportService(deps: PdfReportServiceDeps) {
  const { db, chartRenderer } = deps;

  async function generateReport(storeId: string, title: string): Promise<ReportResponse> {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('Title is required');
    }

    if (title.length > MAX_TITLE_LENGTH) {
      throw new ValidationError(`Title must not exceed ${MAX_TITLE_LENGTH} characters`);
    }

    // Fetch saved charts for this store (only columns needed for PDF)
    const charts = await db('saved_charts')
      .where({ store_id: storeId })
      .orderBy('position_index', 'asc')
      .select('title', 'chart_config');

    if (charts.length === 0) {
      throw new ValidationError('No saved charts to export. Save some charts to your dashboard first.');
    }

    // Create the report record
    const [inserted] = await db('reports')
      .insert({
        store_id: storeId,
        title: title.trim(),
        status: 'generating',
        chart_count: charts.length,
      })
      .returning('*');

    try {
      // Render each chart to PNG buffer
      const chartImages: Array<{ title: string; buffer: Buffer | null }> = [];
      for (const chart of charts) {
        let config;
        try {
          config = typeof chart.chart_config === 'string'
            ? JSON.parse(chart.chart_config)
            : chart.chart_config;
        } catch {
          logger.warn({ chartTitle: chart.title }, 'Skipping chart with invalid config');
          chartImages.push({ title: chart.title, buffer: null });
          continue;
        }

        // Skip table-type charts (they can't be rendered to PNG)
        if (config && config.type === 'table') {
          chartImages.push({ title: chart.title, buffer: null });
          continue;
        }

        const buffer = await chartRenderer.renderToBuffer(config);
        chartImages.push({ title: chart.title, buffer });
      }

      // Build PDF
      const pdfBuffer = await buildPdf(title.trim(), chartImages);
      const fileData = pdfBuffer.toString('base64');

      // Update report record with completed status and file data
      const [updated] = await db('reports')
        .where({ id: inserted.id, store_id: storeId })
        .update({
          status: 'completed',
          file_data: fileData,
        })
        .returning('*');

      // Enforce max reports limit — delete oldest if exceeds
      await cleanupOldReports(storeId);

      logger.info({ storeId, reportId: updated.id, chartCount: charts.length }, 'PDF report generated');
      return toResponse(updated as ReportRecord);
    } catch (err) {
      // Mark report as failed
      await db('reports')
        .where({ id: inserted.id, store_id: storeId })
        .update({ status: 'failed' });

      logger.error({ storeId, reportId: inserted.id, err }, 'PDF report generation failed');
      throw err;
    }
  }

  async function listReports(storeId: string): Promise<ReportResponse[]> {
    const records = await db('reports')
      .where({ store_id: storeId })
      .orderBy('created_at', 'desc')
      .select<ReportRecord[]>('id', 'store_id', 'title', 'status', 'chart_count', 'created_at');

    return records.map(toResponse);
  }

  async function getReportFile(storeId: string, reportId: string): Promise<Buffer> {
    const record = await db('reports')
      .where({ id: reportId, store_id: storeId })
      .first<ReportRecord | undefined>();

    if (!record) {
      throw new NotFoundError('Report not found');
    }

    if (record.status !== 'completed') {
      throw new ValidationError('Report is not ready for download');
    }

    if (!record.file_data) {
      throw new NotFoundError('Report file data not found');
    }

    return Buffer.from(record.file_data, 'base64');
  }

  async function deleteReport(storeId: string, reportId: string): Promise<void> {
    const deleted = await db('reports')
      .where({ id: reportId, store_id: storeId })
      .del();

    if (deleted === 0) {
      throw new NotFoundError('Report not found');
    }

    logger.info({ storeId, reportId }, 'Report deleted');
  }

  async function cleanupOldReports(storeId: string): Promise<void> {
    const countResult = await db('reports')
      .where({ store_id: storeId })
      .count('* as count')
      .first<{ count: string }>();

    const total = parseInt(countResult?.count ?? '0', 10);
    if (total <= MAX_REPORTS_PER_STORE) {
      return;
    }

    // Delete oldest reports beyond the limit
    const toDelete = total - MAX_REPORTS_PER_STORE;
    const oldReports = await db('reports')
      .where({ store_id: storeId })
      .orderBy('created_at', 'asc')
      .limit(toDelete)
      .select<Array<{ id: string }>>('id');

    const idsToDelete = oldReports.map((r) => r.id);
    if (idsToDelete.length > 0) {
      await db('reports')
        .whereIn('id', idsToDelete)
        .andWhere({ store_id: storeId })
        .del();

      logger.info({ storeId, deletedCount: idsToDelete.length }, 'Old reports cleaned up');
    }
  }

  return {
    generateReport,
    listReports,
    getReportFile,
    deleteReport,
  };
}

async function buildPdf(
  title: string,
  chartImages: Array<{ title: string; buffer: Buffer | null }>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));

    // Header
    doc.fontSize(24).text(title, { align: 'center' });
    doc.moveDown(0.5);
    const now = new Date().toISOString();
    doc.fontSize(10).fillColor('#666666').text(
      `Generated on ${now.split('T')[0]} at ${now.split('T')[1].split('.')[0]} UTC`,
      { align: 'center' },
    );
    doc.fillColor('#000000');
    doc.moveDown(1);

    // Separator line
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(1);

    // Charts
    let chartsRendered = 0;
    for (const chart of chartImages) {
      // Check if we need a new page (leave 200px for chart + title)
      if (doc.y > 600) {
        doc.addPage();
      }

      doc.fontSize(14).text(chart.title, { align: 'left' });
      doc.moveDown(0.5);

      if (chart.buffer) {
        // Fit chart image within page width
        doc.image(chart.buffer, {
          fit: [495, 280],
          align: 'center',
        });
        chartsRendered++;
      } else {
        doc.fontSize(10).fillColor('#999999').text('(Table data — not rendered as image)', { align: 'center' });
        doc.fillColor('#000000');
      }

      doc.moveDown(1.5);
    }

    // Footer
    if (doc.y > 700) {
      doc.addPage();
    }
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#999999').text(
      `Woo AI Analytics Report — ${chartsRendered} chart(s) rendered`,
      { align: 'center' },
    );

    doc.end();
  });
}

export type PdfReportService = ReturnType<typeof createPdfReportService>;
