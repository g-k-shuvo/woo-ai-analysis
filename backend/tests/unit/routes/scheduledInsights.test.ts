import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ScheduledInsightResponse } from '../../../src/services/scheduledInsightsService.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { scheduledInsightsRoutes } = await import(
  '../../../src/routes/scheduledInsights/index.js'
);
const { registerErrorHandler } = await import('../../../src/middleware/errorHandler.js');
const { ValidationError, NotFoundError } = await import('../../../src/utils/errors.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const INSIGHT_ID = 'aabb0000-1111-2222-3333-444455556666';

function makeInsightResponse(
  overrides: Partial<ScheduledInsightResponse> = {},
): ScheduledInsightResponse {
  return {
    id: INSIGHT_ID,
    name: 'Daily Revenue Summary',
    frequency: 'daily',
    hour: 8,
    dayOfWeek: null,
    enabled: true,
    lastRunAt: null,
    nextRunAt: '2026-02-13T08:00:00.000Z',
    createdAt: '2026-02-12T10:00:00.000Z',
    updatedAt: '2026-02-12T10:00:00.000Z',
    ...overrides,
  };
}

interface MockScheduledInsightsService {
  createInsight: jest.Mock<
    (storeId: string, input: Record<string, unknown>) => Promise<ScheduledInsightResponse>
  >;
  listInsights: jest.Mock<(storeId: string) => Promise<ScheduledInsightResponse[]>>;
  updateInsight: jest.Mock<
    (storeId: string, id: string, input: Record<string, unknown>) => Promise<ScheduledInsightResponse>
  >;
  deleteInsight: jest.Mock<(storeId: string, id: string) => Promise<void>>;
}

function createMockService(): MockScheduledInsightsService {
  return {
    createInsight: jest.fn<
      (storeId: string, input: Record<string, unknown>) => Promise<ScheduledInsightResponse>
    >(),
    listInsights: jest.fn<(storeId: string) => Promise<ScheduledInsightResponse[]>>(),
    updateInsight: jest.fn<
      (storeId: string, id: string, input: Record<string, unknown>) => Promise<ScheduledInsightResponse>
    >(),
    deleteInsight: jest.fn<(storeId: string, id: string) => Promise<void>>(),
  };
}

async function buildApp(mockService: MockScheduledInsightsService): Promise<FastifyInstance> {
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
    scheduledInsightsRoutes(instance, {
      scheduledInsightsService: mockService as unknown as Parameters<
        typeof scheduledInsightsRoutes
      >[1]['scheduledInsightsService'],
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/scheduled-insights', () => {
  let app: FastifyInstance;
  let mockService: MockScheduledInsightsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 201 with insight data on success', async () => {
    mockService.createInsight.mockResolvedValue(makeInsightResponse());

    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'Daily Revenue Summary', frequency: 'daily', hour: 8 },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(INSIGHT_ID);
    expect(body.data.name).toBe('Daily Revenue Summary');
    expect(body.data.frequency).toBe('daily');
    expect(body.data.hour).toBe(8);
  });

  it('validates name is required (returns 400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { frequency: 'daily', hour: 8 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates name is non-empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: '', frequency: 'daily', hour: 8 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates frequency is required', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'Test', hour: 8 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates frequency enum (daily/weekly)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'Test', frequency: 'monthly', hour: 8 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates hour is required', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'Test', frequency: 'daily' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates hour minimum (0)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'Test', frequency: 'daily', hour: -1 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates hour maximum (23)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'Test', frequency: 'daily', hour: 24 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates name max length (255)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'a'.repeat(256), frequency: 'daily', hour: 8 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('accepts valid weekly schedule with dayOfWeek', async () => {
    mockService.createInsight.mockResolvedValue(
      makeInsightResponse({ frequency: 'weekly', dayOfWeek: 1 }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: {
        name: 'Weekly Digest',
        frequency: 'weekly',
        hour: 9,
        dayOfWeek: 1,
      },
    });

    expect(response.statusCode).toBe(201);
  });

  it('calls service.createInsight with store.id and input', async () => {
    mockService.createInsight.mockResolvedValue(makeInsightResponse());

    await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'Test', frequency: 'daily', hour: 8, enabled: true },
    });

    expect(mockService.createInsight).toHaveBeenCalledWith(STORE_ID, {
      name: 'Test',
      frequency: 'daily',
      hour: 8,
      enabled: true,
    });
  });

  it('does not call service when validation fails', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: {},
    });

    expect(mockService.createInsight).not.toHaveBeenCalled();
  });

  it('handles service ValidationError (400)', async () => {
    mockService.createInsight.mockRejectedValue(
      new ValidationError('Maximum of 5 scheduled insights allowed per store'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'Test', frequency: 'daily', hour: 8 },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Maximum of 5');
  });

  it('handles generic error (500)', async () => {
    mockService.createInsight.mockRejectedValue(new Error('DB connection lost'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/scheduled-insights',
      payload: { name: 'Test', frequency: 'daily', hour: 8 },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('GET /api/scheduled-insights', () => {
  let app: FastifyInstance;
  let mockService: MockScheduledInsightsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 200 with insights list', async () => {
    mockService.listInsights.mockResolvedValue([
      makeInsightResponse(),
      makeInsightResponse({ id: 'insight-2', name: 'Weekly Digest' }),
    ]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/scheduled-insights',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.insights).toHaveLength(2);
  });

  it('returns empty list when no insights', async () => {
    mockService.listInsights.mockResolvedValue([]);

    const response = await app.inject({
      method: 'GET',
      url: '/api/scheduled-insights',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.insights).toEqual([]);
  });

  it('calls service.listInsights with store.id', async () => {
    mockService.listInsights.mockResolvedValue([]);

    await app.inject({
      method: 'GET',
      url: '/api/scheduled-insights',
    });

    expect(mockService.listInsights).toHaveBeenCalledWith(STORE_ID);
  });

  it('returns 500 when service throws', async () => {
    mockService.listInsights.mockRejectedValue(new Error('DB error'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/scheduled-insights',
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });
});

describe('PUT /api/scheduled-insights/:id', () => {
  let app: FastifyInstance;
  let mockService: MockScheduledInsightsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 200 with updated insight', async () => {
    mockService.updateInsight.mockResolvedValue(
      makeInsightResponse({ name: 'Updated Name' }),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { name: 'Updated Name' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Updated Name');
  });

  it('calls service.updateInsight with store.id, insight id, and input', async () => {
    mockService.updateInsight.mockResolvedValue(makeInsightResponse());

    await app.inject({
      method: 'PUT',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { name: 'New Name', enabled: false },
    });

    expect(mockService.updateInsight).toHaveBeenCalledWith(STORE_ID, INSIGHT_ID, {
      name: 'New Name',
      enabled: false,
    });
  });

  it('handles NotFoundError (404)', async () => {
    mockService.updateInsight.mockRejectedValue(
      new NotFoundError('Scheduled insight not found'),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { name: 'New Name' },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('handles ValidationError (400)', async () => {
    mockService.updateInsight.mockRejectedValue(
      new ValidationError('Name is required'),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { name: '' },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates frequency enum on update', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { frequency: 'monthly' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('validates hour range on update', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { hour: 25 },
    });

    expect(response.statusCode).toBe(400);
  });

  it('handles generic error (500)', async () => {
    mockService.updateInsight.mockRejectedValue(new Error('DB timeout'));

    const response = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { name: 'Test' },
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('accepts partial update with only enabled field', async () => {
    mockService.updateInsight.mockResolvedValue(
      makeInsightResponse({ enabled: false }),
    );

    const response = await app.inject({
      method: 'PUT',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { enabled: false },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.enabled).toBe(false);
  });
});

describe('DELETE /api/scheduled-insights/:id', () => {
  let app: FastifyInstance;
  let mockService: MockScheduledInsightsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 200 with deleted: true', async () => {
    mockService.deleteInsight.mockResolvedValue(undefined);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.deleted).toBe(true);
  });

  it('calls service.deleteInsight with store.id and insight id', async () => {
    mockService.deleteInsight.mockResolvedValue(undefined);

    await app.inject({
      method: 'DELETE',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
    });

    expect(mockService.deleteInsight).toHaveBeenCalledWith(STORE_ID, INSIGHT_ID);
  });

  it('handles NotFoundError (404)', async () => {
    mockService.deleteInsight.mockRejectedValue(
      new NotFoundError('Scheduled insight not found'),
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('handles generic error (500)', async () => {
    mockService.deleteInsight.mockRejectedValue(new Error('DB timeout'));

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
    });

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('passes different insight IDs correctly', async () => {
    mockService.deleteInsight.mockResolvedValue(undefined);
    const customId = 'ccdd0000-1111-2222-3333-444455556666';

    await app.inject({
      method: 'DELETE',
      url: `/api/scheduled-insights/${customId}`,
    });

    expect(mockService.deleteInsight).toHaveBeenCalledWith(STORE_ID, customId);
  });
});

// ── Route method restrictions ───────────────────────────────────────

describe('route method restrictions', () => {
  let app: FastifyInstance;
  let mockService: MockScheduledInsightsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockService = createMockService();
    app = await buildApp(mockService);
  });

  it('returns 404 for GET /api/scheduled-insights/:id (no single get endpoint)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for POST /api/scheduled-insights/:id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { name: 'Test' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for PATCH /api/scheduled-insights/:id', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/scheduled-insights/${INSIGHT_ID}`,
      payload: { name: 'Test' },
    });

    expect(response.statusCode).toBe(404);
  });
});
