import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock logger before importing modules
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createAIQueryPipeline } = await import('../../src/ai/pipeline.js');

const VALID_STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

// ── Mock helpers ──────────────────────────────────────────────

function makeStoreContext() {
  return {
    storeId: VALID_STORE_ID,
    currency: 'USD',
    totalOrders: 200,
    totalProducts: 75,
    totalCustomers: 60,
    totalCategories: 8,
    earliestOrderDate: '2025-01-01T00:00:00Z',
    latestOrderDate: '2026-02-11T12:00:00Z',
  };
}

function createMockSchemaContextService() {
  return {
    getStoreContext: jest.fn<() => Promise<ReturnType<typeof makeStoreContext>>>()
      .mockResolvedValue(makeStoreContext()),
  };
}

interface MockOpenAI {
  chat: {
    completions: {
      create: jest.Mock<() => Promise<{
        choices: Array<{
          message: { content: string | null };
        }>;
      }>>;
    };
  };
}

function createMockOpenAI(content: string): MockOpenAI {
  return {
    chat: {
      completions: {
        create: jest.fn<() => Promise<{
          choices: Array<{ message: { content: string | null } }>;
        }>>().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  };
}

describe('AI Pipeline Integration', () => {
  let mockSchemaContext: ReturnType<typeof createMockSchemaContextService>;

  beforeEach(() => {
    mockSchemaContext = createMockSchemaContextService();
  });

  describe('end-to-end: question → system prompt → OpenAI → validation → result', () => {
    it('processes a revenue question end-to-end', async () => {
      const openaiResponse = JSON.stringify({
        sql: "SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') LIMIT 1",
        explanation: 'Total revenue from completed and processing orders.',
        chartSpec: null,
      });

      const mockOpenAI = createMockOpenAI(openaiResponse);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'What is my total revenue?',
      );

      // Verify schema context was fetched
      expect(mockSchemaContext.getStoreContext).toHaveBeenCalledWith(VALID_STORE_ID);

      // Verify OpenAI was called with correct structure
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      const callArgs = (mockOpenAI.chat.completions.create.mock.calls as unknown[][])[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };

      // System prompt should contain schema and rules
      expect(callArgs.messages[0].content).toContain('orders');
      expect(callArgs.messages[0].content).toContain('store_id');
      expect(callArgs.messages[0].content).toContain('SELECT');
      expect(callArgs.messages[0].content).toContain('Total orders: 200');
      expect(callArgs.messages[0].content).toContain('Store currency: USD');

      // Verify result
      expect(result.sql).toContain('SELECT');
      expect(result.sql).toContain('store_id');
      expect(result.params).toEqual([VALID_STORE_ID]);
      expect(result.explanation).toBeTruthy();
      expect(result.chartSpec).toBeNull();
    });

    it('processes a product query with chart spec end-to-end', async () => {
      const openaiResponse = JSON.stringify({
        sql: "SELECT p.name, SUM(oi.quantity) AS total_sold FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 WHERE oi.store_id = $1 GROUP BY p.name ORDER BY total_sold DESC LIMIT 10",
        explanation: 'Top 10 products by quantity sold.',
        chartSpec: {
          type: 'bar',
          title: 'Top 10 Products by Sales',
          xLabel: 'Product',
          yLabel: 'Units Sold',
          dataKey: 'total_sold',
          labelKey: 'name',
        },
      });

      const mockOpenAI = createMockOpenAI(openaiResponse);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'What are my top 10 selling products?',
      );

      expect(result.sql).toContain('store_id');
      expect(result.sql).toContain('LIMIT 10');
      expect(result.chartSpec).not.toBeNull();
      expect(result.chartSpec!.type).toBe('bar');
      expect(result.chartSpec!.dataKey).toBe('total_sold');
    });
  });

  describe('security: pipeline rejects dangerous SQL even from OpenAI', () => {
    it('rejects DROP TABLE even in a SELECT wrapper', async () => {
      const openaiResponse = JSON.stringify({
        sql: "SELECT 1; DROP TABLE orders WHERE store_id = $1",
        explanation: 'Hacked!',
        chartSpec: null,
      });

      const mockOpenAI = createMockOpenAI(openaiResponse);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'Drop all tables'),
      ).rejects.toThrow('Unable to process this question');
    });

    it('rejects DELETE injected by OpenAI', async () => {
      const openaiResponse = JSON.stringify({
        sql: "DELETE FROM orders WHERE store_id = $1",
        explanation: 'Deletes orders.',
        chartSpec: null,
      });

      const mockOpenAI = createMockOpenAI(openaiResponse);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'Delete all orders'),
      ).rejects.toThrow('Unable to process this question');
    });

    it('rejects UNION injection from OpenAI', async () => {
      const openaiResponse = JSON.stringify({
        sql: "SELECT * FROM orders WHERE store_id = $1 UNION SELECT * FROM pg_catalog.pg_tables LIMIT 100",
        explanation: 'Lists tables.',
        chartSpec: null,
      });

      const mockOpenAI = createMockOpenAI(openaiResponse);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'Show me system tables'),
      ).rejects.toThrow('Unable to process this question');
    });

    it('rejects SQL without store_id from OpenAI', async () => {
      const openaiResponse = JSON.stringify({
        sql: "SELECT COUNT(*) FROM orders LIMIT 1",
        explanation: 'Count all orders across stores.',
        chartSpec: null,
      });

      const mockOpenAI = createMockOpenAI(openaiResponse);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'How many orders total?'),
      ).rejects.toThrow('Unable to process this question');
    });
  });

  describe('system prompt includes store metadata', () => {
    it('system prompt contains store currency and counts', async () => {
      const openaiResponse = JSON.stringify({
        sql: "SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1",
        explanation: 'Count orders.',
        chartSpec: null,
      });

      const mockOpenAI = createMockOpenAI(openaiResponse);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await pipeline.processQuestion(VALID_STORE_ID, 'How many orders?');

      const callArgs = (mockOpenAI.chat.completions.create.mock.calls as unknown[][])[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };

      const systemPrompt = callArgs.messages[0].content;
      expect(systemPrompt).toContain('Total orders: 200');
      expect(systemPrompt).toContain('Total products: 75');
      expect(systemPrompt).toContain('Total customers: 60');
      expect(systemPrompt).toContain('Total categories: 8');
      expect(systemPrompt).toContain('Store currency: USD');
    });
  });

  describe('LIMIT enforcement in pipeline', () => {
    it('auto-appends LIMIT 100 when OpenAI omits it', async () => {
      const openaiResponse = JSON.stringify({
        sql: "SELECT * FROM orders WHERE store_id = $1",
        explanation: 'Gets all orders.',
        chartSpec: null,
      });

      const mockOpenAI = createMockOpenAI(openaiResponse);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'Show me all orders',
      );

      expect(result.sql).toContain('LIMIT 100');
    });
  });
});
