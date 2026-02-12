import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ChatResponse, SuggestionsResponse } from '../../src/services/chatService.js';

// ── Mock logger ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { chatQueryRoutes } = await import('../../src/routes/chat/query.js');
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');
const { createRateLimiter } = await import('../../src/middleware/rateLimiter.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    answer: 'Your total revenue is $12,345.67',
    sql: "SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1",
    rows: [{ total_revenue: '12345.67' }],
    rowCount: 1,
    durationMs: 42,
    chartSpec: null,
    chartConfig: null,
    chartImage: null,
    chartMeta: null,
    ...overrides,
  };
}

interface MockChatService {
  ask: jest.Mock<(storeId: string, question: string) => Promise<ChatResponse>>;
  getSuggestions: jest.Mock<() => SuggestionsResponse>;
}

interface MockRedis {
  eval: jest.Mock<(...args: unknown[]) => Promise<number>>;
  ttl: jest.Mock<(key: string) => Promise<number>>;
}

async function buildApp(
  mockChatService: MockChatService,
  mockRedis: MockRedis,
  rateLimitConfig = { maxRequests: 3, windowSeconds: 60 },
): Promise<FastifyInstance> {
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

  const rateLimiter = createRateLimiter({
    redis: mockRedis as unknown as Parameters<typeof createRateLimiter>[0]['redis'],
    config: rateLimitConfig,
  });

  await app.register(async (instance) =>
    chatQueryRoutes(instance, {
      chatService: mockChatService as unknown as Parameters<typeof chatQueryRoutes>[1]['chatService'],
      rateLimiter,
    }),
  );

  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Rate limiting integration — POST /api/chat/query', () => {
  let app: FastifyInstance;
  let mockChatService: MockChatService;
  let mockRedis: MockRedis;
  let counter: { value: number };

  beforeEach(async () => {
    jest.clearAllMocks();
    counter = { value: 0 };

    mockChatService = {
      ask: jest.fn<(storeId: string, question: string) => Promise<ChatResponse>>().mockResolvedValue(makeResponse()),
      getSuggestions: jest.fn<() => SuggestionsResponse>().mockReturnValue({ suggestions: [] }),
    };

    mockRedis = {
      eval: jest.fn<(...args: unknown[]) => Promise<number>>().mockImplementation(async () => {
        counter.value += 1;
        return counter.value;
      }),
      ttl: jest.fn<(key: string) => Promise<number>>().mockResolvedValue(45),
    };

    app = await buildApp(mockChatService, mockRedis);
  });

  it('allows requests under the limit', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/query',
      payload: { question: 'Revenue?' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('allows exactly maxRequests requests', async () => {
    // Send 3 requests (counter goes 1, 2, 3)
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'Revenue?' },
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it('returns 429 when exceeding the limit', async () => {
    // Exhaust the limit
    counter.value = 3;

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/query',
      payload: { question: 'Revenue?' },
    });

    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RATE_LIMIT_ERROR');
  });

  it('returns retryAfter in response body', async () => {
    counter.value = 3;
    mockRedis.ttl.mockResolvedValue(25);

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/query',
      payload: { question: 'Revenue?' },
    });

    expect(response.statusCode).toBe(429);
    const body = JSON.parse(response.body);
    expect(body.error.retryAfter).toBe(25);
  });

  it('sets Retry-After header', async () => {
    counter.value = 3;
    mockRedis.ttl.mockResolvedValue(25);

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/query',
      payload: { question: 'Revenue?' },
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('25');
  });

  it('returns user-friendly error message', async () => {
    counter.value = 3;

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/query',
      payload: { question: 'Revenue?' },
    });

    const body = JSON.parse(response.body);
    expect(body.error.message).toBe("You've sent too many questions. Please wait a moment.");
  });

  it('does not call chatService.ask when rate limited', async () => {
    counter.value = 3;

    await app.inject({
      method: 'POST',
      url: '/api/chat/query',
      payload: { question: 'Revenue?' },
    });

    expect(mockChatService.ask).not.toHaveBeenCalled();
  });

  it('does not rate limit GET /api/chat/suggestions', async () => {
    counter.value = 100; // Would exceed any limit

    const response = await app.inject({
      method: 'GET',
      url: '/api/chat/suggestions',
    });

    expect(response.statusCode).toBe(200);
  });

  it('allows requests through when Redis errors', async () => {
    mockRedis.eval.mockRejectedValue(new Error('Redis down'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/query',
      payload: { question: 'Revenue?' },
    });

    expect(response.statusCode).toBe(200);
    expect(mockChatService.ask).toHaveBeenCalled();
  });

  it('uses correct Redis key pattern for store isolation', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/chat/query',
      payload: { question: 'Revenue?' },
    });

    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1,
      `ratelimit:${STORE_ID}:chat`,
      60,
    );
  });
});

describe('Rate limiting integration — without rateLimiter', () => {
  it('works without rate limiter (backward compatible)', async () => {
    const mockChatService: MockChatService = {
      ask: jest.fn<(storeId: string, question: string) => Promise<ChatResponse>>().mockResolvedValue(makeResponse()),
      getSuggestions: jest.fn<() => SuggestionsResponse>().mockReturnValue({ suggestions: [] }),
    };

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
      chatQueryRoutes(instance, {
        chatService: mockChatService as unknown as Parameters<typeof chatQueryRoutes>[1]['chatService'],
      }),
    );

    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/chat/query',
      payload: { question: 'Revenue?' },
    });

    expect(response.statusCode).toBe(200);
  });
});
