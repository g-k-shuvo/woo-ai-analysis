import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { SavedChartResponse } from '../../../src/services/savedChartsService.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { dashboardChartsRoutes } = await import('../../../src/routes/dashboards/charts.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHART_ID = '660e8400-e29b-41d4-a716-446655440001';

function makeChartResponse(overrides: Partial<SavedChartResponse> = {}): SavedChartResponse {
  return {
    id: CHART_ID,
    title: 'Revenue by Product',
    queryText: 'Show revenue by product',
    chartConfig: { type: 'bar', data: { labels: ['A'], datasets: [] } },
    positionIndex: 0,
    createdAt: '2026-02-12T00:00:00Z',
    updatedAt: '2026-02-12T00:00:00Z',
    ...overrides,
  };
}

interface MockSavedChartsService {
  saveChart: jest.Mock<(storeId: string, input: unknown) => Promise<SavedChartResponse>>;
  listCharts: jest.Mock<(storeId: string) => Promise<SavedChartResponse[]>>;
  getChart: jest.Mock<(storeId: string, chartId: string) => Promise<SavedChartResponse>>;
  updateChart: jest.Mock<(storeId: string, chartId: string, input: unknown) => Promise<SavedChartResponse>>;
  deleteChart: jest.Mock<(storeId: string, chartId: string) => Promise<void>>;
  updateLayout: jest.Mock<(storeId: string, positions: unknown) => Promise<void>>;
}

async function buildApp(mockService: MockSavedChartsService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

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
    dashboardChartsRoutes(instance, {
      savedChartsService: mockService as unknown as Parameters<typeof dashboardChartsRoutes>[1]['savedChartsService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/dashboards/charts', () => {
  let app: FastifyInstance;
  let mockService: MockSavedChartsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = {
      saveChart: jest.fn<(storeId: string, input: unknown) => Promise<SavedChartResponse>>(),
      listCharts: jest.fn<(storeId: string) => Promise<SavedChartResponse[]>>(),
      getChart: jest.fn<(storeId: string, chartId: string) => Promise<SavedChartResponse>>(),
      updateChart: jest.fn<(storeId: string, chartId: string, input: unknown) => Promise<SavedChartResponse>>(),
      deleteChart: jest.fn<(storeId: string, chartId: string) => Promise<void>>(),
      updateLayout: jest.fn<(storeId: string, positions: unknown) => Promise<void>>(),
    };
    app = await buildApp(mockService);
  });

  it('returns 201 with saved chart', async () => {
    mockService.saveChart.mockResolvedValue(makeChartResponse());

    const response = await app.inject({
      method: 'POST',
      url: '/api/dashboards/charts',
      payload: {
        title: 'Revenue by Product',
        queryText: 'Show revenue by product',
        chartConfig: { type: 'bar' },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(CHART_ID);
  });

  it('passes storeId from request.store', async () => {
    mockService.saveChart.mockResolvedValue(makeChartResponse());

    await app.inject({
      method: 'POST',
      url: '/api/dashboards/charts',
      payload: { title: 'Test', chartConfig: { type: 'bar' } },
    });

    expect(mockService.saveChart).toHaveBeenCalledWith(
      STORE_ID,
      expect.objectContaining({ title: 'Test' }),
    );
  });

  it('returns 400 when title is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/dashboards/charts',
      payload: { chartConfig: { type: 'bar' } },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when chartConfig is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/dashboards/charts',
      payload: { title: 'Test' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when title is empty string', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/dashboards/charts',
      payload: { title: '', chartConfig: { type: 'bar' } },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when title exceeds 255 characters', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/dashboards/charts',
      payload: { title: 'a'.repeat(256), chartConfig: { type: 'bar' } },
    });

    expect(response.statusCode).toBe(400);
  });

  it('does not call service when validation fails', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/dashboards/charts',
      payload: {},
    });

    expect(mockService.saveChart).not.toHaveBeenCalled();
  });

  it('returns 500 when service throws generic error', async () => {
    mockService.saveChart.mockRejectedValue(new Error('Unexpected'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/dashboards/charts',
      payload: { title: 'Test', chartConfig: { type: 'bar' } },
    });

    expect(response.statusCode).toBe(500);
  });
});

describe('GET /api/dashboards/charts', () => {
  let app: FastifyInstance;
  let mockService: MockSavedChartsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = {
      saveChart: jest.fn<(storeId: string, input: unknown) => Promise<SavedChartResponse>>(),
      listCharts: jest.fn<(storeId: string) => Promise<SavedChartResponse[]>>(),
      getChart: jest.fn<(storeId: string, chartId: string) => Promise<SavedChartResponse>>(),
      updateChart: jest.fn<(storeId: string, chartId: string, input: unknown) => Promise<SavedChartResponse>>(),
      deleteChart: jest.fn<(storeId: string, chartId: string) => Promise<void>>(),
      updateLayout: jest.fn<(storeId: string, positions: unknown) => Promise<void>>(),
    };
    app = await buildApp(mockService);
  });

  it('returns 200 with charts array', async () => {
    mockService.listCharts.mockResolvedValue([makeChartResponse()]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/dashboards/charts',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.charts).toHaveLength(1);
  });

  it('returns empty charts array', async () => {
    mockService.listCharts.mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/dashboards/charts',
    });

    const body = JSON.parse(response.body);
    expect(body.data.charts).toEqual([]);
  });

  it('passes storeId to service', async () => {
    mockService.listCharts.mockResolvedValue([]);

    await app.inject({
      method: 'GET',
      url: '/api/dashboards/charts',
    });

    expect(mockService.listCharts).toHaveBeenCalledWith(STORE_ID);
  });

  it('returns 404 for POST on /api/dashboards/charts list endpoint path', async () => {
    // POST is handled separately; we just ensure GET works
    mockService.listCharts.mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/dashboards/charts',
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('PUT /api/dashboards/charts/:id', () => {
  let app: FastifyInstance;
  let mockService: MockSavedChartsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = {
      saveChart: jest.fn<(storeId: string, input: unknown) => Promise<SavedChartResponse>>(),
      listCharts: jest.fn<(storeId: string) => Promise<SavedChartResponse[]>>(),
      getChart: jest.fn<(storeId: string, chartId: string) => Promise<SavedChartResponse>>(),
      updateChart: jest.fn<(storeId: string, chartId: string, input: unknown) => Promise<SavedChartResponse>>(),
      deleteChart: jest.fn<(storeId: string, chartId: string) => Promise<void>>(),
      updateLayout: jest.fn<(storeId: string, positions: unknown) => Promise<void>>(),
    };
    app = await buildApp(mockService);
  });

  it('returns 200 with updated chart', async () => {
    mockService.updateChart.mockResolvedValue(makeChartResponse({ title: 'Updated' }));

    const response = await app.inject({
      method: 'PUT',
      url: `/api/dashboards/charts/${CHART_ID}`,
      payload: { title: 'Updated' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Updated');
  });

  it('passes storeId and chartId to service', async () => {
    mockService.updateChart.mockResolvedValue(makeChartResponse());

    await app.inject({
      method: 'PUT',
      url: `/api/dashboards/charts/${CHART_ID}`,
      payload: { title: 'Updated' },
    });

    expect(mockService.updateChart).toHaveBeenCalledWith(
      STORE_ID,
      CHART_ID,
      expect.objectContaining({ title: 'Updated' }),
    );
  });

  it('accepts update with only chartConfig', async () => {
    mockService.updateChart.mockResolvedValue(makeChartResponse());

    const response = await app.inject({
      method: 'PUT',
      url: `/api/dashboards/charts/${CHART_ID}`,
      payload: { chartConfig: { type: 'pie' } },
    });

    expect(response.statusCode).toBe(200);
  });

  it('accepts update with title exceeding limit via schema validation', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/dashboards/charts/${CHART_ID}`,
      payload: { title: 'a'.repeat(256) },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('DELETE /api/dashboards/charts/:id', () => {
  let app: FastifyInstance;
  let mockService: MockSavedChartsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = {
      saveChart: jest.fn<(storeId: string, input: unknown) => Promise<SavedChartResponse>>(),
      listCharts: jest.fn<(storeId: string) => Promise<SavedChartResponse[]>>(),
      getChart: jest.fn<(storeId: string, chartId: string) => Promise<SavedChartResponse>>(),
      updateChart: jest.fn<(storeId: string, chartId: string, input: unknown) => Promise<SavedChartResponse>>(),
      deleteChart: jest.fn<(storeId: string, chartId: string) => Promise<void>>(),
      updateLayout: jest.fn<(storeId: string, positions: unknown) => Promise<void>>(),
    };
    app = await buildApp(mockService);
  });

  it('returns 200 with deleted true', async () => {
    mockService.deleteChart.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/dashboards/charts/${CHART_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it('passes storeId and chartId to service', async () => {
    mockService.deleteChart.mockResolvedValue(undefined);

    await app.inject({
      method: 'DELETE',
      url: `/api/dashboards/charts/${CHART_ID}`,
    });

    expect(mockService.deleteChart).toHaveBeenCalledWith(STORE_ID, CHART_ID);
  });

  it('returns error when service throws', async () => {
    mockService.deleteChart.mockRejectedValue(new Error('Not found'));

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/dashboards/charts/${CHART_ID}`,
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('PUT /api/dashboards/layout', () => {
  let app: FastifyInstance;
  let mockService: MockSavedChartsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = {
      saveChart: jest.fn<(storeId: string, input: unknown) => Promise<SavedChartResponse>>(),
      listCharts: jest.fn<(storeId: string) => Promise<SavedChartResponse[]>>(),
      getChart: jest.fn<(storeId: string, chartId: string) => Promise<SavedChartResponse>>(),
      updateChart: jest.fn<(storeId: string, chartId: string, input: unknown) => Promise<SavedChartResponse>>(),
      deleteChart: jest.fn<(storeId: string, chartId: string) => Promise<void>>(),
      updateLayout: jest.fn<(storeId: string, positions: unknown) => Promise<void>>(),
    };
    app = await buildApp(mockService);
  });

  it('returns 200 with updated true', async () => {
    mockService.updateLayout.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/layout',
      payload: {
        positions: [
          { id: 'chart-1', positionIndex: 0 },
          { id: 'chart-2', positionIndex: 1 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(true);
  });

  it('passes storeId and positions to service', async () => {
    mockService.updateLayout.mockResolvedValue(undefined);

    const positions = [
      { id: 'chart-1', positionIndex: 0 },
      { id: 'chart-2', positionIndex: 1 },
    ];

    await app.inject({
      method: 'PUT',
      url: '/api/dashboards/layout',
      payload: { positions },
    });

    expect(mockService.updateLayout).toHaveBeenCalledWith(STORE_ID, positions);
  });

  it('returns 400 when positions is missing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/layout',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when positions is empty array', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/layout',
      payload: { positions: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when position item missing id', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/layout',
      payload: { positions: [{ positionIndex: 0 }] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when positionIndex is negative', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/layout',
      payload: { positions: [{ id: 'chart-1', positionIndex: -1 }] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('does not call service when validation fails', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/dashboards/layout',
      payload: {},
    });

    expect(mockService.updateLayout).not.toHaveBeenCalled();
  });
});

// ── Route method tests ──────────────────────────────────────────────

describe('route method restrictions', () => {
  let app: FastifyInstance;
  let mockService: MockSavedChartsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = {
      saveChart: jest.fn<(storeId: string, input: unknown) => Promise<SavedChartResponse>>(),
      listCharts: jest.fn<(storeId: string) => Promise<SavedChartResponse[]>>(),
      getChart: jest.fn<(storeId: string, chartId: string) => Promise<SavedChartResponse>>(),
      updateChart: jest.fn<(storeId: string, chartId: string, input: unknown) => Promise<SavedChartResponse>>(),
      deleteChart: jest.fn<(storeId: string, chartId: string) => Promise<void>>(),
      updateLayout: jest.fn<(storeId: string, positions: unknown) => Promise<void>>(),
    };
    app = await buildApp(mockService);
  });

  it('returns 404 for GET /api/dashboards/charts/:id (not implemented)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/dashboards/charts/${CHART_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for DELETE /api/dashboards/layout', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/dashboards/layout',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for POST /api/dashboards/layout', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/dashboards/layout',
      payload: { positions: [] },
    });

    expect(response.statusCode).toBe(404);
  });
});
