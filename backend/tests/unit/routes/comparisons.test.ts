import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ComparisonResponse } from '../../../src/services/dateComparisonService.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { comparisonRoutes } = await import(
  '../../../src/routes/comparisons/index.js'
);
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');
const { ValidationError, NotFoundError } = await import('../../../src/utils/errors.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const COMPARISON_ID = 'cccc0000-1111-2222-3333-444455556666';

function makeComparisonResponse(
  overrides: Partial<ComparisonResponse> = {},
): ComparisonResponse {
  return {
    id: COMPARISON_ID,
    preset: 'this_month',
    currentStart: '2026-02-01T00:00:00.000Z',
    currentEnd: '2026-02-13T12:00:00.000Z',
    previousStart: '2026-01-01T00:00:00.000Z',
    previousEnd: '2026-02-01T00:00:00.000Z',
    metrics: {
      current: { revenue: 12500.0, orderCount: 150, avgOrderValue: 83.33 },
      previous: { revenue: 10200.0, orderCount: 120, avgOrderValue: 85.0 },
      revenueChange: 2300.0,
      revenueChangePercent: 22.55,
      orderCountChange: 30,
      orderCountChangePercent: 25.0,
      aovChange: -1.67,
      aovChangePercent: -1.96,
      trend: 'up',
    },
    breakdown: [
      { date: '2026-02-01', currentRevenue: 450.0, previousRevenue: 380.0 },
      { date: '2026-02-02', currentRevenue: 520.0, previousRevenue: 410.0 },
    ],
    createdAt: '2026-02-13T10:00:00.000Z',
    ...overrides,
  };
}

interface MockDateComparisonService {
  generateComparison: jest.Mock<
    (storeId: string, input: Record<string, unknown>) => Promise<ComparisonResponse>
  >;
  listComparisons: jest.Mock<(storeId: string) => Promise<ComparisonResponse[]>>;
  getComparison: jest.Mock<
    (storeId: string, id: string) => Promise<ComparisonResponse>
  >;
  deleteComparison: jest.Mock<(storeId: string, id: string) => Promise<void>>;
}

function createMockService(): MockDateComparisonService {
  return {
    generateComparison: jest.fn<
      (storeId: string, input: Record<string, unknown>) => Promise<ComparisonResponse>
    >(),
    listComparisons: jest.fn<(storeId: string) => Promise<ComparisonResponse[]>>(),
    getComparison: jest.fn<
      (storeId: string, id: string) => Promise<ComparisonResponse>
    >(),
    deleteComparison: jest.fn<(storeId: string, id: string) => Promise<void>>(),
  };
}

async function buildApp(mockService: MockDateComparisonService): Promise<FastifyInstance> {
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
    comparisonRoutes(instance, {
      dateComparisonService: mockService as unknown as Parameters<
        typeof comparisonRoutes
      >[1]['dateComparisonService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/comparisons', () => {
  let app: FastifyInstance;
  let mockService: MockDateComparisonService;

  beforeEach(async () => {
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('generates a preset comparison and returns 201', async () => {
    mockService.generateComparison.mockResolvedValueOnce(makeComparisonResponse());

    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: { preset: 'this_month' },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(COMPARISON_ID);
    expect(body.data.preset).toBe('this_month');
  });

  it('passes preset to service', async () => {
    mockService.generateComparison.mockResolvedValueOnce(makeComparisonResponse());

    await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: { preset: 'this_week' },
    });

    expect(mockService.generateComparison).toHaveBeenCalledWith(
      STORE_ID,
      expect.objectContaining({ preset: 'this_week' }),
    );
  });

  it('generates a custom comparison and returns 201', async () => {
    mockService.generateComparison.mockResolvedValueOnce(
      makeComparisonResponse({ preset: null }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: {
        currentStart: '2026-02-01',
        currentEnd: '2026-02-28',
        previousStart: '2026-01-01',
        previousEnd: '2026-01-31',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('passes custom dates to service', async () => {
    mockService.generateComparison.mockResolvedValueOnce(
      makeComparisonResponse({ preset: null }),
    );

    await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: {
        currentStart: '2026-02-01',
        currentEnd: '2026-02-28',
        previousStart: '2026-01-01',
        previousEnd: '2026-01-31',
      },
    });

    expect(mockService.generateComparison).toHaveBeenCalledWith(
      STORE_ID,
      expect.objectContaining({
        currentStart: '2026-02-01',
        currentEnd: '2026-02-28',
        previousStart: '2026-01-01',
        previousEnd: '2026-01-31',
      }),
    );
  });

  it('returns 400 for invalid preset', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: { preset: 'invalid' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for partial custom dates', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: {
        currentStart: '2026-02-01',
        currentEnd: '2026-02-28',
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when service throws ValidationError', async () => {
    mockService.generateComparison.mockRejectedValueOnce(
      new ValidationError('Maximum of 20 comparisons allowed per store'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: { preset: 'this_month' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.message).toContain('20 comparisons');
  });

  it('returns 500 for unexpected errors', async () => {
    mockService.generateComparison.mockRejectedValueOnce(new Error('DB down'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: { preset: 'this_month' },
    });

    expect(response.statusCode).toBe(500);
  });

  it('accepts all valid presets', async () => {
    const presets = ['today', 'this_week', 'this_month', 'this_year', 'last_7_days', 'last_30_days'];

    for (const preset of presets) {
      mockService.generateComparison.mockResolvedValueOnce(
        makeComparisonResponse({ preset }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/comparisons',
        payload: { preset },
      });

      expect(response.statusCode).toBe(201);
    }
  });

  it('rejects non-string preset', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/comparisons',
      payload: { preset: 123 },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/comparisons', () => {
  let app: FastifyInstance;
  let mockService: MockDateComparisonService;

  beforeEach(async () => {
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 200 with comparisons list', async () => {
    mockService.listComparisons.mockResolvedValueOnce([makeComparisonResponse()]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/comparisons',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.comparisons).toHaveLength(1);
    expect(body.data.comparisons[0].id).toBe(COMPARISON_ID);
  });

  it('returns 200 with empty list', async () => {
    mockService.listComparisons.mockResolvedValueOnce([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/comparisons',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.comparisons).toHaveLength(0);
  });

  it('passes storeId to service', async () => {
    mockService.listComparisons.mockResolvedValueOnce([]);

    await app.inject({
      method: 'GET',
      url: '/api/comparisons',
    });

    expect(mockService.listComparisons).toHaveBeenCalledWith(STORE_ID);
  });

  it('returns 500 on service error', async () => {
    mockService.listComparisons.mockRejectedValueOnce(new Error('DB down'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/comparisons',
    });

    expect(response.statusCode).toBe(500);
  });
});

describe('GET /api/comparisons/:id', () => {
  let app: FastifyInstance;
  let mockService: MockDateComparisonService;

  beforeEach(async () => {
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 200 with comparison', async () => {
    mockService.getComparison.mockResolvedValueOnce(makeComparisonResponse());

    const response = await app.inject({
      method: 'GET',
      url: `/api/comparisons/${COMPARISON_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(COMPARISON_ID);
    expect(body.data.metrics.trend).toBe('up');
  });

  it('passes storeId and comparisonId to service', async () => {
    mockService.getComparison.mockResolvedValueOnce(makeComparisonResponse());

    await app.inject({
      method: 'GET',
      url: `/api/comparisons/${COMPARISON_ID}`,
    });

    expect(mockService.getComparison).toHaveBeenCalledWith(STORE_ID, COMPARISON_ID);
  });

  it('returns 404 when not found', async () => {
    mockService.getComparison.mockRejectedValueOnce(
      new NotFoundError('Comparison not found'),
    );

    const response = await app.inject({
      method: 'GET',
      url: `/api/comparisons/${COMPARISON_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 400 for invalid UUID format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/comparisons/not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns full metrics in response', async () => {
    mockService.getComparison.mockResolvedValueOnce(makeComparisonResponse());

    const response = await app.inject({
      method: 'GET',
      url: `/api/comparisons/${COMPARISON_ID}`,
    });

    const body = JSON.parse(response.body);
    expect(body.data.metrics.current.revenue).toBe(12500.0);
    expect(body.data.metrics.previous.revenue).toBe(10200.0);
    expect(body.data.metrics.revenueChange).toBe(2300.0);
    expect(body.data.metrics.revenueChangePercent).toBe(22.55);
    expect(body.data.metrics.orderCountChange).toBe(30);
    expect(body.data.metrics.aovChange).toBe(-1.67);
  });

  it('returns breakdown in response', async () => {
    mockService.getComparison.mockResolvedValueOnce(makeComparisonResponse());

    const response = await app.inject({
      method: 'GET',
      url: `/api/comparisons/${COMPARISON_ID}`,
    });

    const body = JSON.parse(response.body);
    expect(body.data.breakdown).toHaveLength(2);
    expect(body.data.breakdown[0].date).toBe('2026-02-01');
    expect(body.data.breakdown[0].currentRevenue).toBe(450.0);
  });
});

describe('DELETE /api/comparisons/:id', () => {
  let app: FastifyInstance;
  let mockService: MockDateComparisonService;

  beforeEach(async () => {
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 200 with deleted true', async () => {
    mockService.deleteComparison.mockResolvedValueOnce(undefined);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/comparisons/${COMPARISON_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it('passes storeId and comparisonId to service', async () => {
    mockService.deleteComparison.mockResolvedValueOnce(undefined);

    await app.inject({
      method: 'DELETE',
      url: `/api/comparisons/${COMPARISON_ID}`,
    });

    expect(mockService.deleteComparison).toHaveBeenCalledWith(STORE_ID, COMPARISON_ID);
  });

  it('returns 404 when not found', async () => {
    mockService.deleteComparison.mockRejectedValueOnce(
      new NotFoundError('Comparison not found'),
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/comparisons/${COMPARISON_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 400 for invalid UUID format', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/comparisons/bad-id',
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 500 on unexpected error', async () => {
    mockService.deleteComparison.mockRejectedValueOnce(new Error('DB failure'));

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/comparisons/${COMPARISON_ID}`,
    });

    expect(response.statusCode).toBe(500);
  });
});
