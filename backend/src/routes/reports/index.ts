import type { FastifyInstance } from 'fastify';
import type { PdfReportService } from '../../services/pdfReportService.js';

export interface ReportRoutesDeps {
  pdfReportService: PdfReportService;
}

interface GenerateReportBody {
  title: string;
}

const generateReportSchema = {
  body: {
    type: 'object' as const,
    required: ['title'],
    properties: {
      title: { type: 'string' as const, minLength: 1, maxLength: 255 },
    },
  },
};

export async function reportRoutes(
  fastify: FastifyInstance,
  deps: ReportRoutesDeps,
) {
  const { pdfReportService } = deps;

  // POST /api/reports/generate — generate a PDF report
  fastify.post<{ Body: GenerateReportBody }>(
    '/api/reports/generate',
    { schema: generateReportSchema },
    async (request, reply) => {
      const store = request.store!;
      const { title } = request.body;

      const report = await pdfReportService.generateReport(store.id, title);

      return reply.status(201).send({
        success: true,
        data: report,
      });
    },
  );

  // GET /api/reports — list all reports for the store
  fastify.get('/api/reports', async (request, reply) => {
    const store = request.store!;
    const reports = await pdfReportService.listReports(store.id);

    return reply.status(200).send({
      success: true,
      data: { reports },
    });
  });

  // GET /api/reports/:id/download — download PDF file
  fastify.get<{ Params: { id: string } }>(
    '/api/reports/:id/download',
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;

      const pdfBuffer = await pdfReportService.getReportFile(store.id, id);

      return reply
        .status(200)
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="report-${id}.pdf"`)
        .send(pdfBuffer);
    },
  );

  // DELETE /api/reports/:id — delete a report
  fastify.delete<{ Params: { id: string } }>(
    '/api/reports/:id',
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;

      await pdfReportService.deleteReport(store.id, id);

      return reply.status(200).send({
        success: true,
        data: { deleted: true },
      });
    },
  );
}
