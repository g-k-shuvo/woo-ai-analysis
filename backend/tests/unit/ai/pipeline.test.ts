import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock logger before importing the module under test
jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createAIQueryPipeline } = await import('../../../src/ai/pipeline.js');

const VALID_STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

// ── Mock helpers ──────────────────────────────────────────────

function makeStoreContext() {
  return {
    storeId: VALID_STORE_ID,
    currency: 'USD',
    totalOrders: 100,
    totalProducts: 50,
    totalCustomers: 30,
    totalCategories: 5,
    earliestOrderDate: '2025-01-01T00:00:00Z',
    latestOrderDate: '2026-02-10T23:59:59Z',
  };
}

function makeValidOpenAIResponse() {
  return JSON.stringify({
    sql: "SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') LIMIT 1",
    explanation: 'Sums total revenue from completed and processing orders.',
    chartSpec: null,
  });
}

function makeOpenAIResponseWithChart() {
  return JSON.stringify({
    sql: "SELECT DATE(date_created) AS day, SUM(total) AS daily_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= NOW() - INTERVAL '7 days' GROUP BY DATE(date_created) ORDER BY day ASC LIMIT 7",
    explanation: 'Daily revenue for the last 7 days.',
    chartSpec: {
      type: 'line',
      title: 'Daily Revenue (Last 7 Days)',
      xLabel: 'Day',
      yLabel: 'Revenue ($)',
      dataKey: 'daily_revenue',
      labelKey: 'day',
    },
  });
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

function createMockOpenAI(content: string | null = makeValidOpenAIResponse()): MockOpenAI {
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

function createMockSchemaContextService() {
  return {
    getStoreContext: jest.fn<() => Promise<ReturnType<typeof makeStoreContext>>>()
      .mockResolvedValue(makeStoreContext()),
  };
}

describe('createAIQueryPipeline', () => {
  let mockOpenAI: MockOpenAI;
  let mockSchemaContext: ReturnType<typeof createMockSchemaContextService>;

  beforeEach(() => {
    mockOpenAI = createMockOpenAI();
    mockSchemaContext = createMockSchemaContextService();
  });

  // ── Input validation ─────────────────────────────────────
  describe('input validation', () => {
    it('rejects empty storeId', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(pipeline.processQuestion('', 'What is my revenue?')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('rejects non-UUID storeId', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion('not-a-uuid', 'What is my revenue?'),
      ).rejects.toThrow('Invalid storeId: must be a valid UUID');
    });

    it('rejects empty question', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, ''),
      ).rejects.toThrow('Question cannot be empty');
    });

    it('rejects whitespace-only question', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, '   '),
      ).rejects.toThrow('Question cannot be empty');
    });

    it('rejects question exceeding max length', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const longQuestion = 'a'.repeat(2001);

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, longQuestion),
      ).rejects.toThrow('Question too long');
    });

    it('accepts question at max length', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const maxQuestion = 'a'.repeat(2000);

      const result = await pipeline.processQuestion(VALID_STORE_ID, maxQuestion);
      expect(result.sql).toContain('SELECT');
    });
  });

  // ── Successful pipeline ──────────────────────────────────
  describe('successful pipeline', () => {
    it('returns AIQueryResult with sql, params, explanation, and null chartSpec', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'What is my total revenue?',
      );

      expect(result.sql).toContain('SELECT');
      expect(result.sql).toContain('store_id');
      expect(result.params).toEqual([VALID_STORE_ID]);
      expect(result.explanation).toBe(
        'Sums total revenue from completed and processing orders.',
      );
      expect(result.chartSpec).toBeNull();
    });

    it('returns chartSpec when OpenAI includes one', async () => {
      mockOpenAI = createMockOpenAI(makeOpenAIResponseWithChart());

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'Show me daily revenue for the last 7 days',
      );

      expect(result.chartSpec).not.toBeNull();
      expect(result.chartSpec!.type).toBe('line');
      expect(result.chartSpec!.title).toBe('Daily Revenue (Last 7 Days)');
      expect(result.chartSpec!.dataKey).toBe('daily_revenue');
      expect(result.chartSpec!.labelKey).toBe('day');
    });

    it('calls OpenAI with system and user messages', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      const callArgs = (mockOpenAI.chat.completions.create.mock.calls as unknown[][])[0][0] as {
        messages: Array<{ role: string; content: string }>;
        model: string;
        temperature: number;
      };

      expect(callArgs.messages).toHaveLength(2);
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[1].role).toBe('user');
      expect(callArgs.messages[1].content).toBe('What is my revenue?');
    });

    it('uses gpt-4o model', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?');

      const callArgs = (mockOpenAI.chat.completions.create.mock.calls as unknown[][])[0][0] as {
        model: string;
      };
      expect(callArgs.model).toBe('gpt-4o');
    });

    it('uses temperature 0 for deterministic output', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?');

      const callArgs = (mockOpenAI.chat.completions.create.mock.calls as unknown[][])[0][0] as {
        temperature: number;
      };
      expect(callArgs.temperature).toBe(0);
    });

    it('requests JSON response format from OpenAI', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?');

      const callArgs = (mockOpenAI.chat.completions.create.mock.calls as unknown[][])[0][0] as {
        response_format: { type: string };
      };
      expect(callArgs.response_format).toEqual({ type: 'json_object' });
    });

    it('passes timeout option to OpenAI', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?');

      const options = (mockOpenAI.chat.completions.create.mock.calls as unknown[][])[0][1] as {
        timeout: number;
      };
      expect(options.timeout).toBe(30_000);
    });

    it('sends the question as-is (trimmed) without the store ID', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await pipeline.processQuestion(VALID_STORE_ID, '  What is my revenue?  ');

      const callArgs = (mockOpenAI.chat.completions.create.mock.calls as unknown[][])[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };

      // User message should be trimmed and NOT contain the store ID
      expect(callArgs.messages[1].content).toBe('What is my revenue?');
      expect(callArgs.messages[1].content).not.toContain(VALID_STORE_ID);
    });

    it('fetches store context before calling OpenAI', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?');

      expect(mockSchemaContext.getStoreContext).toHaveBeenCalledWith(
        VALID_STORE_ID,
      );
    });
  });

  // ── OpenAI error handling ────────────────────────────────
  describe('OpenAI error handling', () => {
    it('wraps OpenAI network errors with AIError', async () => {
      jest.useFakeTimers();
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('Connection timeout'),
      );

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const promise = pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?');

      // Advance timers through retry delays
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(10_000);
        await Promise.resolve();
      }

      await expect(promise).rejects.toThrow(
        'Our AI service is temporarily unavailable. Please try again in a moment.',
      );
      jest.useRealTimers();
    });

    it('handles empty response from OpenAI', async () => {
      mockOpenAI = createMockOpenAI(null);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?'),
      ).rejects.toThrow('OpenAI returned an empty response');
    });

    it('handles empty choices array from OpenAI', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [],
      });

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?'),
      ).rejects.toThrow('OpenAI returned an empty response');
    });
  });

  // ── JSON parsing ──────────────────────────────────────────
  describe('JSON parsing', () => {
    it('handles markdown code-fenced JSON responses', async () => {
      const content = '```json\n' + makeValidOpenAIResponse() + '\n```';
      mockOpenAI = createMockOpenAI(content);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'What is my revenue?',
      );

      expect(result.sql).toContain('SELECT');
    });

    it('handles code-fenced JSON without language identifier', async () => {
      const content = '```\n' + makeValidOpenAIResponse() + '\n```';
      mockOpenAI = createMockOpenAI(content);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'What is my revenue?',
      );

      expect(result.sql).toContain('SELECT');
    });

    it('rejects non-JSON response', async () => {
      mockOpenAI = createMockOpenAI('I cannot generate that query.');

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?'),
      ).rejects.toThrow('Failed to parse AI response as JSON');
    });

    it('rejects response missing sql field', async () => {
      mockOpenAI = createMockOpenAI(
        JSON.stringify({ explanation: 'test', chartSpec: null }),
      );

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?'),
      ).rejects.toThrow('AI response missing required "sql" field');
    });

    it('rejects response missing explanation field', async () => {
      mockOpenAI = createMockOpenAI(
        JSON.stringify({
          sql: "SELECT 1 FROM orders WHERE store_id = $1 LIMIT 1",
          chartSpec: null,
        }),
      );

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?'),
      ).rejects.toThrow('AI response missing required "explanation" field');
    });

    it('rejects response with empty sql string', async () => {
      mockOpenAI = createMockOpenAI(
        JSON.stringify({
          sql: '  ',
          explanation: 'test',
          chartSpec: null,
        }),
      );

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?'),
      ).rejects.toThrow('AI response missing required "sql" field');
    });
  });

  // ── SQL validation in pipeline ─────────────────────────────
  describe('SQL validation integration', () => {
    it('rejects dangerous SQL from OpenAI with generic error', async () => {
      mockOpenAI = createMockOpenAI(
        JSON.stringify({
          sql: "DELETE FROM orders WHERE store_id = $1",
          explanation: 'Deletes all orders.',
          chartSpec: null,
        }),
      );

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'Delete all my orders'),
      ).rejects.toThrow('Unable to process this question');
    });

    it('rejects SQL without store_id from OpenAI with generic error', async () => {
      mockOpenAI = createMockOpenAI(
        JSON.stringify({
          sql: "SELECT COUNT(*) FROM orders LIMIT 1",
          explanation: 'Counts all orders.',
          chartSpec: null,
        }),
      );

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'How many orders?'),
      ).rejects.toThrow('Unable to process this question');
    });

    it('appends LIMIT when OpenAI omits it', async () => {
      mockOpenAI = createMockOpenAI(
        JSON.stringify({
          sql: "SELECT * FROM orders WHERE store_id = $1",
          explanation: 'Gets all orders.',
          chartSpec: null,
        }),
      );

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

  // ── ChartSpec handling ─────────────────────────────────────
  describe('chartSpec handling', () => {
    it('returns null chartSpec when OpenAI returns null', async () => {
      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'What is my total revenue?',
      );

      expect(result.chartSpec).toBeNull();
    });

    it('returns null chartSpec when OpenAI returns invalid chartSpec', async () => {
      mockOpenAI = createMockOpenAI(
        JSON.stringify({
          sql: "SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1",
          explanation: 'Count orders.',
          chartSpec: { type: 'invalid_type', title: 'Test' },
        }),
      );

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'How many orders?',
      );

      expect(result.chartSpec).toBeNull();
    });

    it('returns null chartSpec when missing required fields', async () => {
      mockOpenAI = createMockOpenAI(
        JSON.stringify({
          sql: "SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1",
          explanation: 'Count orders.',
          chartSpec: { type: 'bar' }, // missing title, dataKey, labelKey
        }),
      );

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'How many orders?',
      );

      expect(result.chartSpec).toBeNull();
    });
  });

  // ── Schema context errors ──────────────────────────────────
  describe('schema context errors', () => {
    it('wraps unexpected schema context errors as AIError', async () => {
      mockSchemaContext.getStoreContext.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      await expect(
        pipeline.processQuestion(VALID_STORE_ID, 'What is my revenue?'),
      ).rejects.toThrow('Pipeline failed unexpectedly');
    });
  });

  // ── Code fence handling ──────────────────────────────────
  describe('code fence handling', () => {
    it('handles sql language identifier in code fences', async () => {
      const content = '```sql\n' + makeValidOpenAIResponse() + '\n```';
      mockOpenAI = createMockOpenAI(content);

      const pipeline = createAIQueryPipeline({
        openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        schemaContextService: mockSchemaContext,
      });

      const result = await pipeline.processQuestion(
        VALID_STORE_ID,
        'What is my revenue?',
      );

      expect(result.sql).toContain('SELECT');
    });
  });
});
