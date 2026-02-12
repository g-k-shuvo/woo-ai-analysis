import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ReportResponse } from '../../../src/services/pdfReportService.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { reportRoutes } = await import('../../../src/routes/reports/index.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');
const { ValidationError, NotFoundError } = await import('../../../src/utils/errors.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const REPORT_ID = '770e8400-e29b-41d4-a716-446655440002';

function makeReportResponse(overrides: Partial<ReportResponse> = {}): ReportResponse {
  return {
    id: REPORT_ID,
    title: 'Monthly Sales Report',
    status: 'completed',
    chartCount: 3,
    createdAt: '2026-02-12T00:00:00Z',
    ...overrides,
  };
}

interface MockPdfReportService {
  generateReport: jest.Mock<(storeId: string, title: string) => Promise<ReportResponse>>;
  listReports: jest.Mock<(storeId: string) => Promise<ReportResponse[]>>;
  getReportFile: jest.Mock<(storeId: string, reportId: string) => Promise<Buffer>>;
  deleteReport: jest.Mock<(storeId: string, reportId: string) => Promise<void>>;
}

function createMockService(): MockPdfReportService {
  return {
    generateReport: jest.fn<(storeId: string, title: string) => Promise<ReportResponse>>(),
    listReports: jest.fn<(storeId: string) => Promise<ReportResponse[]>>(),
    getReportFile: jest.fn<(storeId: string, reportId: string) => Promise<Buffer>>(),
    deleteReport: jest.fn<(storeId: string, reportId: string) => Promise<void>>(),
  };
}

async function buildApp(mockService: MockPdfReportService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  registerErrorHandler(app);

  app.decorateRequest('store', undefined);
  app.addHook('onRequest', async (request) => {
    request.store = {
      id: STORE_ID,
      store_url: 'https://example.com',
      plan: 'free',
      is_active: true,
    };
  });

  await app.register(async (instance) =>
    reportRoutes(instance, {
      pdfReportService: mockService as unknown as Parameters<typeof reportRoutes>[1]['pdfReportService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/reports/generate', () => {
  let app: FastifyInstance;
  let mockService: MockPdfReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 201 with report data on success', async () => {
    mockService.generateReport.mockResolvedValue(makeReportResponse());

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: { title: 'Monthly Sales Report' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(REPORT_ID);
    expect(body.data.title).toBe('Monthly Sales Report');
    expect(body.data.status).toBe('completed');
    expect(body.data.chartCount).toBe(3);
  });

  it('validates title is required (returns 400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it('validates title is non-empty string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: { title: '' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates title does not exceed 255 characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: { title: 'a'.repeat(256) },
    });

    expect(response.statusCode).toBe(400);
  });

  it('accepts title at exactly 255 characters', async () => {
    mockService.generateReport.mockResolvedValue(
      makeReportResponse({ title: 'a'.repeat(255) }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: { title: 'a'.repeat(255) },
    });

    expect(response.statusCode).toBe(201);
  });

  it('calls pdfReportService.generateReport with store.id and title', async () => {
    mockService.generateReport.mockResolvedValue(makeReportResponse());

    await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: { title: 'Q1 Revenue' },
    });

    expect(mockService.generateReport).toHaveBeenCalledWith(STORE_ID, 'Q1 Revenue');
  });

  it('does not call service when validation fails', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: {},
    });

    expect(mockService.generateReport).not.toHaveBeenCalled();
  });

  it('handles service ValidationError (400)', async () => {
    mockService.generateReport.mockRejectedValue(
      new ValidationError('No saved charts to export. Save some charts to your dashboard first.'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: { title: 'My Report' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('No saved charts');
  });

  it('handles service generic error (500)', async () => {
    mockService.generateReport.mockRejectedValue(new Error('Database connection lost'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: { title: 'My Report' },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('returns correct response shape on success', async () => {
    const reportData = makeReportResponse({
      id: 'report-abc',
      title: 'Custom Report',
      status: 'completed',
      chartCount: 5,
      createdAt: '2026-02-10T12:00:00Z',
    });
    mockService.generateReport.mockResolvedValue(reportData);

    const response = await app.inject({
      method: 'POST',
      url: '/api/reports/generate',
      payload: { title: 'Custom Report' },
    });

    const body = JSON.parse(response.body);
    expect(body).toEqual({
      success: true,
      data: {
        id: 'report-abc',
        title: 'Custom Report',
        status: 'completed',
        chartCount: 5,
        createdAt: '2026-02-10T12:00:00Z',
      },
    });
  });
});

describe('GET /api/reports', () => {
  let app: FastifyInstance;
  let mockService: MockPdfReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 200 with reports list', async () => {
    mockService.listReports.mockResolvedValue([
      makeReportResponse(),
      makeReportResponse({ id: 'report-2', title: 'Weekly Report' }),
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/reports',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.reports).toHaveLength(2);
    expect(body.data.reports[0].id).toBe(REPORT_ID);
    expect(body.data.reports[1].id).toBe('report-2');
  });

  it('returns empty list when no reports', async () => {
    mockService.listReports.mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/reports',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.reports).toEqual([]);
  });

  it('calls pdfReportService.listReports with store.id', async () => {
    mockService.listReports.mockResolvedValue([]);

    await app.inject({
      method: 'GET',
      url: '/api/reports',
    });

    expect(mockService.listReports).toHaveBeenCalledWith(STORE_ID);
  });

  it('returns 500 when service throws', async () => {
    mockService.listReports.mockRejectedValue(new Error('DB error'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/reports',
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it('returns correct response shape with single report', async () => {
    mockService.listReports.mockResolvedValue([makeReportResponse()]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/reports',
    });

    const body = JSON.parse(response.body);
    expect(body.data.reports[0]).toEqual({
      id: REPORT_ID,
      title: 'Monthly Sales Report',
      status: 'completed',
      chartCount: 3,
      createdAt: '2026-02-12T00:00:00Z',
    });
  });
});

describe('GET /api/reports/:id/download', () => {
  let app: FastifyInstance;
  let mockService: MockPdfReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 200 with PDF content-type header', async () => {
    const pdfBuffer = Buffer.from('fake-pdf-content');
    mockService.getReportFile.mockResolvedValue(pdfBuffer);

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports/${REPORT_ID}/download`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
  });

  it('sets Content-Disposition header with filename', async () => {
    const pdfBuffer = Buffer.from('fake-pdf-content');
    mockService.getReportFile.mockResolvedValue(pdfBuffer);

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports/${REPORT_ID}/download`,
    });

    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="report-${REPORT_ID}.pdf"`,
    );
  });

  it('returns PDF buffer from service', async () => {
    const pdfContent = 'PDF-binary-data-here';
    const pdfBuffer = Buffer.from(pdfContent);
    mockService.getReportFile.mockResolvedValue(pdfBuffer);

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports/${REPORT_ID}/download`,
    });

    expect(response.rawPayload).toEqual(pdfBuffer);
  });

  it('calls pdfReportService.getReportFile with store.id and report id', async () => {
    const pdfBuffer = Buffer.from('fake-pdf');
    mockService.getReportFile.mockResolvedValue(pdfBuffer);

    await app.inject({
      method: 'GET',
      url: `/api/reports/${REPORT_ID}/download`,
    });

    expect(mockService.getReportFile).toHaveBeenCalledWith(STORE_ID, REPORT_ID);
  });

  it('handles NotFoundError (404)', async () => {
    mockService.getReportFile.mockRejectedValue(new NotFoundError('Report not found'));

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports/${REPORT_ID}/download`,
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Report not found');
  });

  it('handles ValidationError for non-ready report (400)', async () => {
    mockService.getReportFile.mockRejectedValue(
      new ValidationError('Report is not ready for download'),
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports/${REPORT_ID}/download`,
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Report is not ready for download');
  });

  it('handles NotFoundError for missing file data (404)', async () => {
    mockService.getReportFile.mockRejectedValue(
      new NotFoundError('Report file data not found'),
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports/${REPORT_ID}/download`,
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.message).toBe('Report file data not found');
  });

  it('handles generic service error (500)', async () => {
    mockService.getReportFile.mockRejectedValue(new Error('Unexpected failure'));

    const response = await app.inject({
      method: 'GET',
      url: `/api/reports/${REPORT_ID}/download`,
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('DELETE /api/reports/:id', () => {
  let app: FastifyInstance;
  let mockService: MockPdfReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 200 with deleted: true', async () => {
    mockService.deleteReport.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/reports/${REPORT_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it('calls pdfReportService.deleteReport with store.id and id', async () => {
    mockService.deleteReport.mockResolvedValue(undefined);

    await app.inject({
      method: 'DELETE',
      url: `/api/reports/${REPORT_ID}`,
    });

    expect(mockService.deleteReport).toHaveBeenCalledWith(STORE_ID, REPORT_ID);
  });

  it('handles NotFoundError (404)', async () => {
    mockService.deleteReport.mockRejectedValue(new NotFoundError('Report not found'));

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/reports/${REPORT_ID}`,
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Report not found');
  });

  it('handles generic service error (500)', async () => {
    mockService.deleteReport.mockRejectedValue(new Error('DB timeout'));

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/reports/${REPORT_ID}`,
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('passes different report IDs correctly', async () => {
    mockService.deleteReport.mockResolvedValue(undefined);
    const customId = 'custom-report-id-123';

    await app.inject({
      method: 'DELETE',
      url: `/api/reports/${customId}`,
    });

    expect(mockService.deleteReport).toHaveBeenCalledWith(STORE_ID, customId);
  });
});

// ── Route method restrictions ───────────────────────────────────────

describe('route method restrictions', () => {
  let app: FastifyInstance;
  let mockService: MockPdfReportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 404 for GET /api/reports/generate', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/reports/generate',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for POST /api/reports', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/reports',
      payload: {},
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for PUT /api/reports/:id', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/reports/${REPORT_ID}`,
      payload: { title: 'Updated' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for POST /api/reports/:id/download', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/reports/${REPORT_ID}/download`,
      payload: {},
    });

    expect(response.statusCode).toBe(404);
  });
});
