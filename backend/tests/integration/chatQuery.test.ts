import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { AIQueryResult, QueryExecutionResult, ChartSpec, ChartConfiguration } from '../../src/ai/types.js';

/**
 * Integration tests for the chat query flow.
 *
 * These tests verify the complete chain:
 * chatService.ask → aiPipeline.processQuestion → queryExecutor.execute → toChartConfig → ChatResponse
 *
 * We mock at the boundary (pipeline + executor) but test that chatService
 * correctly wires all components and produces the expected response shape.
 */

// ── Mock logger ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Import after mocks ─────────────────────────────────────────────

const { createChatService } = await import('../../src/services/chatService.js');
const { ValidationError, AIError } = await import('../../src/utils/errors.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeAIResult(overrides: Partial<AIQueryResult> = {}): AIQueryResult {
  return {
    sql: "SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1 AND status = 'completed'",
    params: [STORE_ID],
    explanation: 'Your total revenue from completed orders is $45,250.00',
    chartSpec: null,
    ...overrides,
  };
}

function makeExecResult(overrides: Partial<QueryExecutionResult> = {}): QueryExecutionResult {
  return {
    rows: [{ total_revenue: '45250.00' }],
    rowCount: 1,
    durationMs: 25,
    truncated: false,
    ...overrides,
  };
}

interface MockPipeline {
  processQuestion: jest.Mock<(storeId: string, question: string) => Promise<AIQueryResult>>;
}

interface MockExecutor {
  execute: jest.Mock<(queryResult: AIQueryResult) => Promise<QueryExecutionResult>>;
}

function createMockDeps() {
  const mockPipeline: MockPipeline = {
    processQuestion: jest.fn<(storeId: string, question: string) => Promise<AIQueryResult>>(),
  };
  const mockExecutor: MockExecutor = {
    execute: jest.fn<(queryResult: AIQueryResult) => Promise<QueryExecutionResult>>(),
  };
  return { mockPipeline, mockExecutor };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Chat query integration — full pipeline chain', () => {
  let mockPipeline: MockPipeline;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    const deps = createMockDeps();
    mockPipeline = deps.mockPipeline;
    mockExecutor = deps.mockExecutor;
  });

  // ── Revenue queries ─────────────────────────────────────────────

  describe('revenue queries', () => {
    it('handles simple total revenue query', async () => {
      const aiResult = makeAIResult();
      const execResult = makeExecResult();
      mockPipeline.processQuestion.mockResolvedValue(aiResult);
      mockExecutor.execute.mockResolvedValue(execResult);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'What is my total revenue?');

      expect(result.answer).toBe('Your total revenue from completed orders is $45,250.00');
      expect(result.sql).toContain('store_id');
      expect(result.rows).toEqual([{ total_revenue: '45250.00' }]);
      expect(result.rowCount).toBe(1);
      expect(result.chartSpec).toBeNull();
      expect(result.chartConfig).toBeNull();
    });

    it('handles monthly revenue with bar chart', async () => {
      const chartSpec: ChartSpec = {
        type: 'bar',
        title: 'Monthly Revenue',
        xLabel: 'Month',
        yLabel: 'Revenue ($)',
        dataKey: 'total_revenue',
        labelKey: 'month',
      };
      const rows = [
        { month: '2026-01', total_revenue: '12450.50' },
        { month: '2026-02', total_revenue: '15320.00' },
      ];
      mockPipeline.processQuestion.mockResolvedValue(
        makeAIResult({
          sql: 'SELECT DATE_TRUNC(\'month\', date_created) AS month, SUM(total) AS total_revenue FROM orders WHERE store_id = $1 GROUP BY month ORDER BY month',
          explanation: 'Here is your monthly revenue breakdown.',
          chartSpec,
        }),
      );
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 2 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Show my monthly revenue');

      expect(result.chartSpec).toEqual({ type: 'bar', title: 'Monthly Revenue' });
      expect(result.chartConfig).not.toBeNull();

      // Verify the real toChartConfig produced a valid Chart.js config
      const config = result.chartConfig as ChartConfiguration;
      expect(config.type).toBe('bar');
      expect(config.data.labels).toEqual(['2026-01', '2026-02']);
      expect(config.data.datasets[0].data).toEqual([12450.5, 15320]);
    });

    it('handles revenue over time with line chart', async () => {
      const chartSpec: ChartSpec = {
        type: 'line',
        title: 'Daily Revenue',
        xLabel: 'Date',
        yLabel: 'Revenue ($)',
        dataKey: 'daily_total',
        labelKey: 'order_date',
      };
      const rows = [
        { order_date: '2026-02-10', daily_total: '1820.00' },
        { order_date: '2026-02-11', daily_total: '2105.50' },
        { order_date: '2026-02-12', daily_total: '1450.25' },
      ];
      mockPipeline.processQuestion.mockResolvedValue(
        makeAIResult({ chartSpec, explanation: 'Daily revenue for the last 3 days.' }),
      );
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Revenue last 3 days');

      expect(result.chartSpec).toEqual({ type: 'line', title: 'Daily Revenue' });
      const config = result.chartConfig as ChartConfiguration;
      expect(config.type).toBe('line');
      expect(config.data.labels).toHaveLength(3);
      expect(config.data.datasets[0].data).toEqual([1820, 2105.5, 1450.25]);
    });
  });

  // ── Product queries ─────────────────────────────────────────────

  describe('product queries', () => {
    it('handles top products query with bar chart', async () => {
      const chartSpec: ChartSpec = {
        type: 'bar',
        title: 'Top 5 Products by Revenue',
        xLabel: 'Product',
        yLabel: 'Revenue ($)',
        dataKey: 'revenue',
        labelKey: 'name',
      };
      const rows = [
        { name: 'Premium Widget', revenue: '4250.00' },
        { name: 'Basic Widget', revenue: '2100.00' },
        { name: 'Pro Gadget', revenue: '1890.50' },
        { name: 'Starter Pack', revenue: '1450.00' },
        { name: 'Deluxe Bundle', revenue: '1200.00' },
      ];
      mockPipeline.processQuestion.mockResolvedValue(
        makeAIResult({
          sql: 'SELECT p.name, SUM(oi.total) AS revenue FROM order_items oi JOIN products p ON oi.product_id = p.wc_product_id WHERE oi.store_id = $1 GROUP BY p.name ORDER BY revenue DESC LIMIT 5',
          explanation: 'Here are your top 5 products by revenue.',
          chartSpec,
        }),
      );
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 5 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'What are my top 5 products?');

      expect(result.answer).toBe('Here are your top 5 products by revenue.');
      expect(result.rowCount).toBe(5);
      const config = result.chartConfig as ChartConfiguration;
      expect(config.type).toBe('bar');
      expect(config.data.labels).toEqual([
        'Premium Widget', 'Basic Widget', 'Pro Gadget', 'Starter Pack', 'Deluxe Bundle',
      ]);
      expect(config.data.datasets[0].data).toEqual([4250, 2100, 1890.5, 1450, 1200]);
    });

    it('handles category performance with pie chart', async () => {
      const chartSpec: ChartSpec = {
        type: 'pie',
        title: 'Revenue by Category',
        dataKey: 'category_revenue',
        labelKey: 'category_name',
      };
      const rows = [
        { category_name: 'Electronics', category_revenue: '15000.00' },
        { category_name: 'Clothing', category_revenue: '8500.00' },
        { category_name: 'Home & Garden', category_revenue: '4200.00' },
      ];
      mockPipeline.processQuestion.mockResolvedValue(
        makeAIResult({ chartSpec, explanation: 'Revenue breakdown by category.' }),
      );
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Show revenue by category');

      const config = result.chartConfig as ChartConfiguration;
      expect(config.type).toBe('pie');
      expect(config.data.labels).toEqual(['Electronics', 'Clothing', 'Home & Garden']);
      expect(config.options.plugins.legend).toEqual({ display: true, position: 'right' });
    });
  });

  // ── Customer queries ────────────────────────────────────────────

  describe('customer queries', () => {
    it('handles new vs returning customers with doughnut chart', async () => {
      const chartSpec: ChartSpec = {
        type: 'doughnut',
        title: 'New vs Returning Customers',
        dataKey: 'customer_count',
        labelKey: 'customer_type',
      };
      const rows = [
        { customer_type: 'New', customer_count: '340' },
        { customer_type: 'Returning', customer_count: '520' },
      ];
      mockPipeline.processQuestion.mockResolvedValue(
        makeAIResult({ chartSpec, explanation: 'Customer breakdown: 340 new, 520 returning.' }),
      );
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 2 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'New vs returning customers');

      const config = result.chartConfig as ChartConfiguration;
      expect(config.type).toBe('doughnut');
      expect(config.data.datasets[0].data).toEqual([340, 520]);
    });
  });

  // ── Order queries ───────────────────────────────────────────────

  describe('order queries', () => {
    it('handles order status breakdown with pie chart', async () => {
      const chartSpec: ChartSpec = {
        type: 'pie',
        title: 'Orders by Status',
        dataKey: 'order_count',
        labelKey: 'status',
      };
      const rows = [
        { status: 'completed', order_count: '450' },
        { status: 'processing', order_count: '85' },
        { status: 'on-hold', order_count: '32' },
      ];
      mockPipeline.processQuestion.mockResolvedValue(
        makeAIResult({ chartSpec, explanation: 'Order breakdown by status.' }),
      );
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Order status breakdown');

      const config = result.chartConfig as ChartConfiguration;
      expect(config.type).toBe('pie');
      expect(config.data.labels).toEqual(['completed', 'processing', 'on-hold']);
      expect(config.data.datasets[0].data).toEqual([450, 85, 32]);
    });

    it('handles simple order count query (no chart)', async () => {
      mockPipeline.processQuestion.mockResolvedValue(
        makeAIResult({
          explanation: 'You have 567 total orders.',
          chartSpec: null,
        }),
      );
      mockExecutor.execute.mockResolvedValue(
        makeExecResult({ rows: [{ order_count: '567' }], rowCount: 1 }),
      );

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'How many orders?');

      expect(result.answer).toBe('You have 567 total orders.');
      expect(result.chartSpec).toBeNull();
      expect(result.chartConfig).toBeNull();
    });
  });

  // ── Error scenarios ─────────────────────────────────────────────

  describe('error scenarios', () => {
    it('throws ValidationError for empty question', async () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, '')).rejects.toBeInstanceOf(ValidationError);
      await expect(chatService.ask(STORE_ID, '')).rejects.toThrow('Question cannot be empty');
    });

    it('propagates AIError from pipeline (invalid question)', async () => {
      mockPipeline.processQuestion.mockRejectedValue(
        new AIError('Unable to process this question. Please try rephrasing.'),
      );

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, 'gibberish')).rejects.toBeInstanceOf(AIError);
    });

    it('propagates AIError from executor (timeout)', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult());
      mockExecutor.execute.mockRejectedValue(
        new AIError('The query took too long to execute. Try asking a simpler question.'),
      );

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, 'Complex query'))
        .rejects.toThrow('The query took too long to execute.');
    });

    it('propagates AIError from executor (syntax error)', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult());
      mockExecutor.execute.mockRejectedValue(
        new AIError('The generated query contained a syntax error. Please try rephrasing your question.'),
      );

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, 'Bad SQL query'))
        .rejects.toThrow('syntax error');
    });

    it('propagates AIError from executor (permission denied)', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult());
      mockExecutor.execute.mockRejectedValue(
        new AIError('Query execution failed due to a permissions error.'),
      );

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, 'Delete orders'))
        .rejects.toThrow('permissions error');
    });

    it('does not call executor when pipeline fails', async () => {
      mockPipeline.processQuestion.mockRejectedValue(new AIError('Pipeline failure'));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      try {
        await chatService.ask(STORE_ID, 'Question');
      } catch {
        // expected
      }

      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });
  });

  // ── Response contract validation ────────────────────────────────

  describe('response contract', () => {
    it('response has all required fields from the API contract', async () => {
      const chartSpec: ChartSpec = {
        type: 'bar',
        title: 'Test Chart',
        xLabel: 'X',
        yLabel: 'Y',
        dataKey: 'value',
        labelKey: 'label',
      };
      const rows = [
        { label: 'A', value: '100' },
        { label: 'B', value: '200' },
      ];
      mockPipeline.processQuestion.mockResolvedValue(
        makeAIResult({ chartSpec, explanation: 'Test answer' }),
      );
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 2, durationMs: 55 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Test question');

      // Validate the contract from docs/features/chat-ui-component.md
      expect(typeof result.answer).toBe('string');
      expect(typeof result.sql).toBe('string');
      expect(Array.isArray(result.rows)).toBe(true);
      expect(typeof result.rowCount).toBe('number');
      expect(typeof result.durationMs).toBe('number');
      expect(result.chartSpec).toEqual({ type: 'bar', title: 'Test Chart' });
      expect(result.chartConfig).not.toBeNull();
    });

    it('chartSpec summary contains only type and title', async () => {
      const chartSpec: ChartSpec = {
        type: 'line',
        title: 'Revenue Trend',
        xLabel: 'Date',
        yLabel: 'Revenue',
        dataKey: 'revenue',
        labelKey: 'date',
      };
      const rows = [{ date: '2026-01', revenue: '1000' }];
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 1 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Revenue trend');
      const keys = Object.keys(result.chartSpec!);
      expect(keys).toEqual(['type', 'title']);
    });

    it('returns empty rows array (not null) when query returns nothing', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult({
        explanation: 'No orders found for that period.',
      }));
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows: [], rowCount: 0 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Orders from 2099');

      expect(result.rows).toEqual([]);
      expect(result.rows).not.toBeNull();
      expect(result.rowCount).toBe(0);
    });
  });

  // ── Chart spec + toChartConfig real integration ─────────────────

  describe('real toChartConfig integration', () => {
    it('produces null chartConfig when chartSpec is null', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec: null }));
      mockExecutor.execute.mockResolvedValue(makeExecResult());

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Total revenue');

      expect(result.chartConfig).toBeNull();
    });

    it('produces null chartConfig when rows are empty and chartSpec is present', async () => {
      const chartSpec: ChartSpec = {
        type: 'bar',
        title: 'Revenue',
        dataKey: 'revenue',
        labelKey: 'name',
      };
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows: [], rowCount: 0 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Products sold last year');

      expect(result.chartConfig).toBeNull();
    });

    it('produces valid ChartConfiguration for matching spec + rows', async () => {
      const chartSpec: ChartSpec = {
        type: 'bar',
        title: 'Top Products',
        xLabel: 'Product',
        yLabel: 'Revenue ($)',
        dataKey: 'revenue',
        labelKey: 'name',
      };
      const rows = [
        { name: 'Widget A', revenue: '1000' },
        { name: 'Widget B', revenue: '2000' },
        { name: 'Widget C', revenue: '3000' },
      ];
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Top products');
      const config = result.chartConfig as ChartConfiguration;

      expect(config).not.toBeNull();
      expect(config.type).toBe('bar');
      expect(config.data.labels).toEqual(['Widget A', 'Widget B', 'Widget C']);
      expect(config.data.datasets[0].data).toEqual([1000, 2000, 3000]);
      expect(config.options.responsive).toBe(true);
      expect(config.options.plugins.title.text).toBe('Top Products');
      expect(config.options.scales?.x.title.text).toBe('Product');
      expect(config.options.scales?.y.title.text).toBe('Revenue ($)');
    });

    it('produces null chartConfig when dataKey does not match rows', async () => {
      const chartSpec: ChartSpec = {
        type: 'bar',
        title: 'Revenue',
        dataKey: 'nonexistent_column',
        labelKey: 'name',
      };
      const rows = [{ name: 'Widget', revenue: '1000' }];
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 1 }));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Revenue');

      expect(result.chartConfig).toBeNull();
    });
  });

  // ── Tenant isolation verification ───────────────────────────────

  describe('tenant isolation', () => {
    it('passes storeId through the pipeline correctly', async () => {
      const specificStoreId = '123e4567-e89b-12d3-a456-426614174000';
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult());
      mockExecutor.execute.mockResolvedValue(makeExecResult());

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await chatService.ask(specificStoreId, 'Revenue?');

      expect(mockPipeline.processQuestion).toHaveBeenCalledWith(specificStoreId, 'Revenue?');
    });

    it('different store IDs produce separate pipeline calls', async () => {
      const storeA = '550e8400-e29b-41d4-a716-446655440000';
      const storeB = '660e8400-e29b-41d4-a716-446655440001';
      mockPipeline.processQuestion.mockResolvedValue(makeAIResult());
      mockExecutor.execute.mockResolvedValue(makeExecResult());

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await chatService.ask(storeA, 'Revenue?');
      await chatService.ask(storeB, 'Revenue?');

      const calls = mockPipeline.processQuestion.mock.calls as unknown[][];
      expect(calls[0][0]).toBe(storeA);
      expect(calls[1][0]).toBe(storeB);
    });
  });
});

// ── Chat suggestions integration tests ─────────────────────────────

describe('Chat suggestions integration', () => {
  let mockPipeline: MockPipeline;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    const deps = createMockDeps();
    mockPipeline = deps.mockPipeline;
    mockExecutor = deps.mockExecutor;
  });

  describe('getSuggestions()', () => {
    it('returns suggestions covering all major query categories', () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = chatService.getSuggestions();
      const allSuggestions = result.suggestions.join(' ').toLowerCase();

      expect(allSuggestions).toContain('revenue');
      expect(allSuggestions).toContain('product');
      expect(allSuggestions).toContain('customer');
      expect(allSuggestions).toContain('order');
    });

    it('returns suggestions that are valid questions', () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = chatService.getSuggestions();

      for (const suggestion of result.suggestions) {
        expect(typeof suggestion).toBe('string');
        expect(suggestion.length).toBeGreaterThan(10);
        expect(suggestion.length).toBeLessThan(200);
      }
    });

    it('returns consistent suggestions across multiple calls', () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result1 = chatService.getSuggestions();
      const result2 = chatService.getSuggestions();

      expect(result1.suggestions).toEqual(result2.suggestions);
    });

    it('does not require pipeline or executor to be called', () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      chatService.getSuggestions();

      expect(mockPipeline.processQuestion).not.toHaveBeenCalled();
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('returns suggestions that could be used as ask() input', async () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const { suggestions } = chatService.getSuggestions();

      // Each suggestion should be a non-empty string that could be passed to ask()
      for (const suggestion of suggestions) {
        expect(suggestion.trim()).toBe(suggestion);
        expect(suggestion.trim().length).toBeGreaterThan(0);
      }
    });

    it('returns between 4 and 10 suggestions', () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = chatService.getSuggestions();

      expect(result.suggestions.length).toBeGreaterThanOrEqual(4);
      expect(result.suggestions.length).toBeLessThanOrEqual(10);
    });

    it('returns no duplicate suggestions', () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = chatService.getSuggestions();
      const uniqueSuggestions = new Set(result.suggestions);

      expect(uniqueSuggestions.size).toBe(result.suggestions.length);
    });
  });
});
