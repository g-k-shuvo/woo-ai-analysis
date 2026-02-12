import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { RevenueForecastResponse } from '../../../src/services/revenueForecastService.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { forecastRoutes } = await import(
  '../../../src/routes/forecasts/index.js'
);
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');
const { ValidationError, NotFoundError } = await import('../../../src/utils/errors.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const FORECAST_ID = 'ffff0000-1111-2222-3333-444455556666';

function makeForecastResponse(
  overrides: Partial<RevenueForecastResponse> = {},
): RevenueForecastResponse {
  return {
    id: FORECAST_ID,
    daysAhead: 30,
    historicalDays: 90,
    dataPoints: [
      { date: '2026-02-13', predicted: 1250.5, type: 'forecast' },
    ],
    summary: {
      avgDailyRevenue: 1200.0,
      projectedTotal: 37500.0,
      trend: 'up',
    },
    createdAt: '2026-02-12T10:00:00.000Z',
    ...overrides,
  };
}

interface MockRevenueForecastService {
  generateForecast: jest.Mock<
    (storeId: string, input: Record<string, unknown>) => Promise<RevenueForecastResponse>
  >;
  listForecasts: jest.Mock<(storeId: string) => Promise<RevenueForecastResponse[]>>;
  getForecast: jest.Mock<
    (storeId: string, id: string) => Promise<RevenueForecastResponse>
  >;
  deleteForecast: jest.Mock<(storeId: string, id: string) => Promise<void>>;
}

function createMockService(): MockRevenueForecastService {
  return {
    generateForecast: jest.fn<
      (storeId: string, input: Record<string, unknown>) => Promise<RevenueForecastResponse>
    >(),
    listForecasts: jest.fn<(storeId: string) => Promise<RevenueForecastResponse[]>>(),
    getForecast: jest.fn<
      (storeId: string, id: string) => Promise<RevenueForecastResponse>
    >(),
    deleteForecast: jest.fn<(storeId: string, id: string) => Promise<void>>(),
  };
}

async function buildApp(mockService: MockRevenueForecastService): Promise<FastifyInstance> {
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
    forecastRoutes(instance, {
      revenueForecastService: mockService as unknown as Parameters<
        typeof forecastRoutes
      >[1]['revenueForecastService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/forecasts', () => {
  let app: FastifyInstance;
  let mockService: MockRevenueForecastService;

  beforeEach(async () => {
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('generates a forecast and returns 201', async () => {
    mockService.generateForecast.mockResolvedValueOnce(makeForecastResponse());

    const response = await app.inject({
      method: 'POST',
      url: '/api/forecasts',
      payload: { daysAhead: 30 },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(FORECAST_ID);
    expect(body.data.daysAhead).toBe(30);
  });

  it('passes daysAhead to service', async () => {
    mockService.generateForecast.mockResolvedValueOnce(makeForecastResponse());

    await app.inject({
      method: 'POST',
      url: '/api/forecasts',
      payload: { daysAhead: 7 },
    });

    expect(mockService.generateForecast).toHaveBeenCalledWith(
      STORE_ID,
      expect.objectContaining({ daysAhead: 7 }),
    );
  });

  it('returns 400 for missing daysAhead', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/forecasts',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for invalid daysAhead value', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/forecasts',
      payload: { daysAhead: 15 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for non-integer daysAhead', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/forecasts',
      payload: { daysAhead: 'abc' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when service throws ValidationError', async () => {
    mockService.generateForecast.mockRejectedValueOnce(
      new ValidationError('At least 7 days of order history required'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/forecasts',
      payload: { daysAhead: 30 },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.message).toContain('7 days');
  });

  it('passes store.id to service', async () => {
    mockService.generateForecast.mockResolvedValueOnce(makeForecastResponse());

    await app.inject({
      method: 'POST',
      url: '/api/forecasts',
      payload: { daysAhead: 30 },
    });

    expect(mockService.generateForecast).toHaveBeenCalledWith(
      STORE_ID,
      expect.anything(),
    );
  });
});

describe('GET /api/forecasts', () => {
  let app: FastifyInstance;
  let mockService: MockRevenueForecastService;

  beforeEach(async () => {
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns list of forecasts', async () => {
    mockService.listForecasts.mockResolvedValueOnce([makeForecastResponse()]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/forecasts',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.forecasts).toHaveLength(1);
  });

  it('returns empty array when no forecasts', async () => {
    mockService.listForecasts.mockResolvedValueOnce([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/forecasts',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.forecasts).toEqual([]);
  });

  it('passes store.id to service', async () => {
    mockService.listForecasts.mockResolvedValueOnce([]);

    await app.inject({
      method: 'GET',
      url: '/api/forecasts',
    });

    expect(mockService.listForecasts).toHaveBeenCalledWith(STORE_ID);
  });
});

describe('GET /api/forecasts/:id', () => {
  let app: FastifyInstance;
  let mockService: MockRevenueForecastService;

  beforeEach(async () => {
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns a specific forecast', async () => {
    mockService.getForecast.mockResolvedValueOnce(makeForecastResponse());

    const response = await app.inject({
      method: 'GET',
      url: `/api/forecasts/${FORECAST_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.id).toBe(FORECAST_ID);
  });

  it('returns 404 when forecast not found', async () => {
    mockService.getForecast.mockRejectedValueOnce(
      new NotFoundError('Forecast not found'),
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/forecasts/${FORECAST_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('passes store.id and forecast id to service', async () => {
    mockService.getForecast.mockResolvedValueOnce(makeForecastResponse());

    await app.inject({
      method: 'GET',
      url: `/api/forecasts/${FORECAST_ID}`,
    });

    expect(mockService.getForecast).toHaveBeenCalledWith(STORE_ID, FORECAST_ID);
  });
});

describe('DELETE /api/forecasts/:id', () => {
  let app: FastifyInstance;
  let mockService: MockRevenueForecastService;

  beforeEach(async () => {
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('deletes a forecast and returns success', async () => {
    mockService.deleteForecast.mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/forecasts/${FORECAST_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.deleted).toBe(true);
  });

  it('returns 404 when forecast not found', async () => {
    mockService.deleteForecast.mockRejectedValueOnce(
      new NotFoundError('Forecast not found'),
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/forecasts/${FORECAST_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('passes store.id and forecast id to service', async () => {
    mockService.deleteForecast.mockResolvedValueOnce(undefined);

    await app.inject({
      method: 'DELETE',
      url: `/api/forecasts/${FORECAST_ID}`,
    });

    expect(mockService.deleteForecast).toHaveBeenCalledWith(STORE_ID, FORECAST_ID);
  });
});
