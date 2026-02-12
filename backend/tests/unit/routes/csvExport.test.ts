import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { csvExportRoutes } = await import('../../../src/routes/exports/csv.js');
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');
const { ValidationError, NotFoundError } = await import('../../../src/utils/errors.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHART_ID = 'aabb0011-2233-4455-6677-8899aabbccdd';
const UTF8_BOM = '\uFEFF';

interface MockCsvExportService {
  exportCsv: jest.Mock<(storeId: string, chartId?: string) => Promise<string>>;
}

function createMockService(): MockCsvExportService {
  return {
    exportCsv: jest.fn<(storeId: string, chartId?: string) => Promise<string>>(),
  };
}

async function buildApp(mockService: MockCsvExportService): Promise<FastifyInstance> {
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
    csvExportRoutes(instance, {
      csvExportService: mockService as unknown as Parameters<typeof csvExportRoutes>[1]['csvExportService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/exports/csv', () => {
  let app: FastifyInstance;
  let mockService: MockCsvExportService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  // ── Success ────────────────────────────────────────────────────

  it('returns 200 with CSV content for all charts', async () => {
    const csvContent = UTF8_BOM + 'Label,Value\r\nA,1';
    mockService.exportCsv.mockResolvedValue(csvContent);

    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('dashboard-export-');
    expect(response.headers['content-disposition']).toContain('.csv');
    expect(response.body).toBe(csvContent);
  });

  it('returns 200 with CSV content for single chart', async () => {
    const csvContent = UTF8_BOM + 'Label,Sales\r\nJan,100';
    mockService.exportCsv.mockResolvedValue(csvContent);

    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: { chartId: CHART_ID },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toContain('chart-export-');
    expect(response.body).toBe(csvContent);
  });

  it('passes storeId to service', async () => {
    mockService.exportCsv.mockResolvedValue(UTF8_BOM + 'data');

    await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: {},
    });

    expect(mockService.exportCsv).toHaveBeenCalledWith(STORE_ID, undefined);
  });

  it('passes chartId to service when provided', async () => {
    mockService.exportCsv.mockResolvedValue(UTF8_BOM + 'data');

    await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: { chartId: CHART_ID },
    });

    expect(mockService.exportCsv).toHaveBeenCalledWith(STORE_ID, CHART_ID);
  });

  it('sets correct Content-Type header', async () => {
    mockService.exportCsv.mockResolvedValue(UTF8_BOM + 'data');

    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: {},
    });

    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
  });

  it('uses dashboard filename when no chartId', async () => {
    mockService.exportCsv.mockResolvedValue(UTF8_BOM + 'data');

    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: {},
    });

    const disposition = response.headers['content-disposition'] as string;
    expect(disposition).toMatch(/^attachment; filename="dashboard-export-\d{4}-\d{2}-\d{2}\.csv"$/);
  });

  it('uses chart filename when chartId provided', async () => {
    mockService.exportCsv.mockResolvedValue(UTF8_BOM + 'data');

    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: { chartId: CHART_ID },
    });

    const disposition = response.headers['content-disposition'] as string;
    expect(disposition).toMatch(/^attachment; filename="chart-export-\d{4}-\d{2}-\d{2}\.csv"$/);
  });

  // ── Errors ─────────────────────────────────────────────────────

  it('returns 400 when service throws ValidationError', async () => {
    mockService.exportCsv.mockRejectedValue(new ValidationError('No saved charts to export.'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('No saved charts to export.');
  });

  it('returns 404 when service throws NotFoundError', async () => {
    mockService.exportCsv.mockRejectedValue(new NotFoundError('Chart not found'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: { chartId: '00000000-0000-0000-0000-000000000000' },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.message).toBe('Chart not found');
  });

  it('rejects invalid chartId format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: { chartId: '<script>alert(1)</script>' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('accepts empty body', async () => {
    mockService.exportCsv.mockResolvedValue(UTF8_BOM + 'data');

    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
  });

  it('handles service throwing generic error', async () => {
    mockService.exportCsv.mockRejectedValue(new Error('Database connection failed'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/exports/csv',
      payload: {},
    });

    expect(response.statusCode).toBe(500);
  });
});
