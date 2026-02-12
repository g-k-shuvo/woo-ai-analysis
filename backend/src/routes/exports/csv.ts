import type { FastifyInstance } from 'fastify';
import type { CsvExportService } from '../../services/csvExportService.js';

export interface CsvExportRoutesDeps {
  csvExportService: CsvExportService;
}

interface ExportCsvBody {
  chartId?: string;
}

const exportCsvSchema = {
  body: {
    type: 'object' as const,
    properties: {
      chartId: {
        type: 'string' as const,
        pattern: '^[0-9a-fA-F-]{1,64}$',
      },
    },
  },
};

export async function csvExportRoutes(
  fastify: FastifyInstance,
  deps: CsvExportRoutesDeps,
) {
  const { csvExportService } = deps;

  // POST /api/exports/csv — export charts as CSV
  fastify.post<{ Body: ExportCsvBody }>(
    '/api/exports/csv',
    { schema: exportCsvSchema },
    async (request, reply) => {
      const store = request.store!;
      const { chartId } = request.body ?? {};

      const csvContent = await csvExportService.exportCsv(store.id, chartId);

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = chartId
        ? `chart-export-${dateStr}.csv`
        : `dashboard-export-${dateStr}.csv`;

      return reply
        .status(200)
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csvContent);
    },
  );
}
