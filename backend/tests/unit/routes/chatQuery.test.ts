import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ChatResponse, SuggestionsResponse } from '../../../src/services/chatService.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { chatQueryRoutes } = await import('../../../src/routes/chat/query.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    answer: 'Your total revenue is $12,345.67',
    sql: "SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1 AND status = 'completed'",
    rows: [{ total_revenue: '12345.67' }],
    rowCount: 1,
    durationMs: 42,
    chartSpec: null,
    chartConfig: null,
    ...overrides,
  };
}

interface MockChatService {
  ask: jest.Mock<(storeId: string, question: string) => Promise<ChatResponse>>;
  getSuggestions: jest.Mock<() => SuggestionsResponse>;
}

async function buildApp(mockChatService: MockChatService): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Decorate request with store (simulating auth middleware)
  app.decorateRequest('store', undefined);

  // Add hook to simulate authenticated store
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
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('POST /api/chat/query', () => {
  let app: FastifyInstance;
  let mockChatService: MockChatService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockChatService = {
      ask: jest.fn<(storeId: string, question: string) => Promise<ChatResponse>>(),
      getSuggestions: jest.fn<() => SuggestionsResponse>(),
    };
    app = await buildApp(mockChatService);
  });

  // ── Successful query ──────────────────────────────────────────

  describe('successful query', () => {
    it('returns 200 with success response', async () => {
      mockChatService.ask.mockResolvedValue(makeResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'What is my total revenue?' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('returns data from chatService.ask', async () => {
      const chatResponse = makeResponse();
      mockChatService.ask.mockResolvedValue(chatResponse);

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'What is my total revenue?' },
      });

      const body = JSON.parse(response.body);
      expect(body.data.answer).toBe(chatResponse.answer);
      expect(body.data.sql).toBe(chatResponse.sql);
      expect(body.data.rows).toEqual(chatResponse.rows);
      expect(body.data.rowCount).toBe(chatResponse.rowCount);
      expect(body.data.durationMs).toBe(chatResponse.durationMs);
    });

    it('passes storeId from request.store to chatService.ask', async () => {
      mockChatService.ask.mockResolvedValue(makeResponse());

      await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'Revenue?' },
      });

      expect(mockChatService.ask).toHaveBeenCalledWith(STORE_ID, 'Revenue?');
    });

    it('passes the question from the request body', async () => {
      mockChatService.ask.mockResolvedValue(makeResponse());

      await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'Top 5 products' },
      });

      expect(mockChatService.ask).toHaveBeenCalledWith(STORE_ID, 'Top 5 products');
    });

    it('returns chartSpec and chartConfig when present', async () => {
      mockChatService.ask.mockResolvedValue(
        makeResponse({
          chartSpec: { type: 'bar', title: 'Revenue' },
          chartConfig: {
            type: 'bar',
            data: { labels: ['A'], datasets: [{ label: 'Rev', data: [100], backgroundColor: ['blue'] }] },
            options: { responsive: true, plugins: { title: { display: true, text: 'Rev' } } },
          },
        }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'Revenue by product' },
      });

      const body = JSON.parse(response.body);
      expect(body.data.chartSpec).toEqual({ type: 'bar', title: 'Revenue' });
      expect(body.data.chartConfig).toBeTruthy();
    });

    it('returns null chartSpec/chartConfig when not present', async () => {
      mockChatService.ask.mockResolvedValue(makeResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'Total revenue' },
      });

      const body = JSON.parse(response.body);
      expect(body.data.chartSpec).toBeNull();
      expect(body.data.chartConfig).toBeNull();
    });
  });

  // ── Input validation ──────────────────────────────────────────

  describe('input validation', () => {
    it('returns 400 when question is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when question is empty string', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when question exceeds 2000 characters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'a'.repeat(2001) },
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts question at exactly 2000 characters', async () => {
      mockChatService.ask.mockResolvedValue(makeResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'a'.repeat(2000) },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 400 when body is not JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        headers: { 'content-type': 'text/plain' },
        payload: 'not json',
      });

      expect(response.statusCode).toBe(400);
    });

    it('does not call chatService when validation fails', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: {},
      });

      expect(mockChatService.ask).not.toHaveBeenCalled();
    });
  });

  // ── Error handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 when chatService.ask throws a generic error', async () => {
      mockChatService.ask.mockRejectedValue(new Error('Unexpected failure'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'Revenue?' },
      });

      expect(response.statusCode).toBe(500);
    });

    it('returns error response when chatService throws', async () => {
      mockChatService.ask.mockRejectedValue(new Error('Something broke'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'Revenue?' },
      });

      const body = JSON.parse(response.body);
      expect(body.success).toBeUndefined(); // Fastify default error handler
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // ── Route configuration ───────────────────────────────────────

  describe('route configuration', () => {
    it('responds to POST method', async () => {
      mockChatService.ask.mockResolvedValue(makeResponse());

      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/query',
        payload: { question: 'Revenue?' },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 404 for GET method', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/query',
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for PUT method', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/chat/query',
        payload: { question: 'Revenue?' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/chat/query',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

// ── GET /api/chat/suggestions tests ──────────────────────────────

describe('GET /api/chat/suggestions', () => {
  let app: FastifyInstance;
  let mockChatService: MockChatService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockChatService = {
      ask: jest.fn<(storeId: string, question: string) => Promise<ChatResponse>>(),
      getSuggestions: jest.fn<() => SuggestionsResponse>(),
    };
    app = await buildApp(mockChatService);
  });

  // ── Successful response ──────────────────────────────────────

  describe('successful response', () => {
    it('returns 200 with success true', async () => {
      mockChatService.getSuggestions.mockReturnValue({
        suggestions: ['What was my total revenue?'],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/suggestions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('returns suggestions array from chatService', async () => {
      const suggestionsData: SuggestionsResponse = {
        suggestions: [
          'What was my total revenue this month?',
          'What are my top 5 selling products?',
          'How many new customers this week?',
        ],
      };
      mockChatService.getSuggestions.mockReturnValue(suggestionsData);

      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/suggestions',
      });

      const body = JSON.parse(response.body);
      expect(body.data.suggestions).toEqual(suggestionsData.suggestions);
    });

    it('calls chatService.getSuggestions', async () => {
      mockChatService.getSuggestions.mockReturnValue({ suggestions: [] });

      await app.inject({
        method: 'GET',
        url: '/api/chat/suggestions',
      });

      expect(mockChatService.getSuggestions).toHaveBeenCalledTimes(1);
    });

    it('returns data.suggestions as an array', async () => {
      mockChatService.getSuggestions.mockReturnValue({
        suggestions: ['Revenue?', 'Products?'],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/suggestions',
      });

      const body = JSON.parse(response.body);
      expect(Array.isArray(body.data.suggestions)).toBe(true);
    });

    it('returns empty suggestions array when getSuggestions returns empty', async () => {
      mockChatService.getSuggestions.mockReturnValue({ suggestions: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/suggestions',
      });

      const body = JSON.parse(response.body);
      expect(body.data.suggestions).toEqual([]);
    });
  });

  // ── Route configuration ──────────────────────────────────────

  describe('route configuration', () => {
    it('responds to GET method', async () => {
      mockChatService.getSuggestions.mockReturnValue({ suggestions: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/api/chat/suggestions',
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 404 for POST method on /api/chat/suggestions', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat/suggestions',
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for PUT method on /api/chat/suggestions', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/chat/suggestions',
        payload: {},
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for DELETE method on /api/chat/suggestions', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/chat/suggestions',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
