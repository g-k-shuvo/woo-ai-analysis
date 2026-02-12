import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mock logger ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { dashboardLayoutRoutes } = await import(
  '../../../src/routes/dashboards/layout.js'
);

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

interface MockDashboardLayoutService {
  updateGridLayout: jest.Mock<(storeId: string, items: unknown) => Promise<void>>;
}

async function buildApp(
  mockService: MockDashboardLayoutService,
): Promise<FastifyInstance> {
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
    dashboardLayoutRoutes(instance, {
      dashboardLayoutService:
        mockService as unknown as Parameters<typeof dashboardLayoutRoutes>[1]['dashboardLayoutService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('PUT /api/dashboards/grid-layout', () => {
  let app: FastifyInstance;
  let mockService: MockDashboardLayoutService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = {
      updateGridLayout: jest.fn<(storeId: string, items: unknown) => Promise<void>>(),
    };
    app = await buildApp(mockService);
  });

  it('returns 200 with updated true', async () => {
    mockService.updateGridLayout.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [
          { id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.updated).toBe(true);
  });

  it('passes storeId and items to service', async () => {
    mockService.updateGridLayout.mockResolvedValue(undefined);

    const items = [
      { id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
      { id: 'chart-2', gridX: 6, gridY: 0, gridW: 6, gridH: 4 },
    ];

    await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: { items },
    });

    expect(mockService.updateGridLayout).toHaveBeenCalledWith(STORE_ID, items);
  });

  it('returns 400 when items is missing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when items is empty array', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: { items: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when item missing id', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ gridX: 0, gridY: 0, gridW: 6, gridH: 4 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when gridX is missing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridY: 0, gridW: 6, gridH: 4 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when gridY is missing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridX: 0, gridW: 6, gridH: 4 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when gridW is missing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridX: 0, gridY: 0, gridH: 4 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when gridH is missing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridX: 0, gridY: 0, gridW: 6 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when gridX is negative', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridX: -1, gridY: 0, gridW: 6, gridH: 4 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when gridW is below minimum', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridX: 0, gridY: 0, gridW: 2, gridH: 4 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when gridW exceeds maximum', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridX: 0, gridY: 0, gridW: 13, gridH: 4 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when gridH is below minimum', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 1 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when gridH exceeds maximum', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 9 }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('does not call service when validation fails', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {},
    });

    expect(mockService.updateGridLayout).not.toHaveBeenCalled();
  });

  it('returns 500 when service throws generic error', async () => {
    mockService.updateGridLayout.mockRejectedValue(new Error('Unexpected'));

    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [{ id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 4 }],
      },
    });

    expect(response.statusCode).toBe(500);
  });

  it('accepts valid boundary values', async () => {
    mockService.updateGridLayout.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/dashboards/grid-layout',
      payload: {
        items: [
          { id: 'chart-1', gridX: 0, gridY: 0, gridW: 3, gridH: 2 },
          { id: 'chart-2', gridX: 0, gridY: 2, gridW: 12, gridH: 8 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('route method restrictions', () => {
  let app: FastifyInstance;
  let mockService: MockDashboardLayoutService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = {
      updateGridLayout: jest.fn<(storeId: string, items: unknown) => Promise<void>>(),
    };
    app = await buildApp(mockService);
  });

  it('returns 404 for GET /api/dashboards/grid-layout', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/dashboards/grid-layout',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for POST /api/dashboards/grid-layout', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/dashboards/grid-layout',
      payload: { items: [] },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for DELETE /api/dashboards/grid-layout', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/dashboards/grid-layout',
    });

    expect(response.statusCode).toBe(404);
  });
});
