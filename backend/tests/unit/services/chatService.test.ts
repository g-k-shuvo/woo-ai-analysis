import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { AIQueryResult, QueryExecutionResult, ChartSpec, ChartSpecResult, ChartConfiguration } from '../../../src/ai/types.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Mock chartSpec ──────────────────────────────────────────────────

const mockToChartConfig = jest.fn<(spec: ChartSpec | null, rows: Record<string, unknown>[]) => ChartSpecResult | null>();

jest.unstable_mockModule('../../../src/ai/chartSpec.js', () => ({
  toChartConfig: mockToChartConfig,
}));

// ── Import after mocks ─────────────────────────────────────────────

const { createChatService } = await import('../../../src/services/chatService.js');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeAIQueryResult(overrides: Partial<AIQueryResult> = {}): AIQueryResult {
  return {
    sql: "SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1 AND status = 'completed'",
    params: [STORE_ID],
    explanation: 'Your total revenue from completed orders is $12,345.67',
    chartSpec: null,
    ...overrides,
  };
}

function makeExecutionResult(overrides: Partial<QueryExecutionResult> = {}): QueryExecutionResult {
  return {
    rows: [{ total_revenue: '12345.67' }],
    rowCount: 1,
    durationMs: 42,
    truncated: false,
    ...overrides,
  };
}

function makeChartSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  return {
    type: 'bar',
    title: 'Revenue by Product',
    xLabel: 'Product',
    yLabel: 'Revenue ($)',
    dataKey: 'revenue',
    labelKey: 'name',
    ...overrides,
  };
}

function makeChartConfig(): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: ['Product 1', 'Product 2'],
      datasets: [{
        label: 'Revenue by Product',
        data: [100, 200],
        backgroundColor: ['rgba(54,162,235,0.6)', 'rgba(255,99,132,0.6)'],
        borderColor: ['rgba(54,162,235,1)', 'rgba(255,99,132,1)'],
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        title: { display: true, text: 'Revenue by Product' },
      },
      scales: {
        x: { title: { display: true, text: 'Product' } },
        y: { title: { display: true, text: 'Revenue ($)' } },
      },
    },
  };
}

interface MockPipeline {
  processQuestion: jest.Mock<(storeId: string, question: string) => Promise<AIQueryResult>>;
}

interface MockExecutor {
  execute: jest.Mock<(queryResult: AIQueryResult) => Promise<QueryExecutionResult>>;
}

function createMocks() {
  const mockPipeline: MockPipeline = {
    processQuestion: jest.fn<(storeId: string, question: string) => Promise<AIQueryResult>>(),
  };
  const mockExecutor: MockExecutor = {
    execute: jest.fn<(queryResult: AIQueryResult) => Promise<QueryExecutionResult>>(),
  };
  return { mockPipeline, mockExecutor };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('chatService', () => {
  let mockPipeline: MockPipeline;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMocks();
    mockPipeline = mocks.mockPipeline;
    mockExecutor = mocks.mockExecutor;
  });

  // ── ask() — happy path ──────────────────────────────────────────

  describe('ask() — happy path', () => {
    it('returns a ChatResponse with answer, sql, rows, rowCount, durationMs', async () => {
      const aiResult = makeAIQueryResult();
      const execResult = makeExecutionResult();
      mockPipeline.processQuestion.mockResolvedValue(aiResult);
      mockExecutor.execute.mockResolvedValue(execResult);
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'What is my total revenue?');

      expect(result.answer).toBe('Your total revenue from completed orders is $12,345.67');
      expect(result.sql).toBe(aiResult.sql);
      expect(result.rows).toEqual(execResult.rows);
      expect(result.rowCount).toBe(1);
      expect(result.durationMs).toBe(42);
    });

    it('calls aiPipeline.processQuestion with storeId and question', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult());
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await chatService.ask(STORE_ID, 'What is my total revenue?');

      expect(mockPipeline.processQuestion).toHaveBeenCalledTimes(1);
      expect(mockPipeline.processQuestion).toHaveBeenCalledWith(STORE_ID, 'What is my total revenue?');
    });

    it('calls queryExecutor.execute with the AI pipeline result', async () => {
      const aiResult = makeAIQueryResult();
      mockPipeline.processQuestion.mockResolvedValue(aiResult);
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await chatService.ask(STORE_ID, 'What is my total revenue?');

      expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
      expect(mockExecutor.execute).toHaveBeenCalledWith(aiResult);
    });

    it('calls toChartConfig with chartSpec and rows from execution result', async () => {
      const chartSpec = makeChartSpec();
      const aiResult = makeAIQueryResult({ chartSpec });
      const execResult = makeExecutionResult({
        rows: [{ name: 'Widget', revenue: 100 }],
        rowCount: 1,
      });
      mockPipeline.processQuestion.mockResolvedValue(aiResult);
      mockExecutor.execute.mockResolvedValue(execResult);
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await chatService.ask(STORE_ID, 'Show product revenue');

      expect(mockToChartConfig).toHaveBeenCalledTimes(1);
      expect(mockToChartConfig).toHaveBeenCalledWith(chartSpec, execResult.rows);
    });

    it('logs processing start and completion', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult());
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await chatService.ask(STORE_ID, 'What is my total revenue?');

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: STORE_ID, questionLength: 25 },
        'Chat service: processing question',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: STORE_ID,
          rowCount: 1,
          durationMs: 42,
          hasChart: false,
        }),
        'Chat service: question answered',
      );
    });
  });

  // ── ask() — with chart spec ─────────────────────────────────────

  describe('ask() — with chart spec', () => {
    it('returns chartSpec summary when AI provides chartSpec', async () => {
      const chartSpec = makeChartSpec();
      const aiResult = makeAIQueryResult({ chartSpec });
      const execResult = makeExecutionResult({
        rows: [
          { name: 'Product 1', revenue: 100 },
          { name: 'Product 2', revenue: 200 },
        ],
        rowCount: 2,
      });
      const chartConfig = makeChartConfig();
      mockPipeline.processQuestion.mockResolvedValue(aiResult);
      mockExecutor.execute.mockResolvedValue(execResult);
      mockToChartConfig.mockReturnValue(chartConfig);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Show revenue by product');

      expect(result.chartSpec).toEqual({ type: 'bar', title: 'Revenue by Product' });
    });

    it('returns chartConfig when toChartConfig produces a configuration', async () => {
      const chartSpec = makeChartSpec();
      const aiResult = makeAIQueryResult({ chartSpec });
      const execResult = makeExecutionResult({
        rows: [
          { name: 'Product 1', revenue: 100 },
          { name: 'Product 2', revenue: 200 },
        ],
        rowCount: 2,
      });
      const chartConfig = makeChartConfig();
      mockPipeline.processQuestion.mockResolvedValue(aiResult);
      mockExecutor.execute.mockResolvedValue(execResult);
      mockToChartConfig.mockReturnValue(chartConfig);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Show revenue by product');

      expect(result.chartConfig).toBe(chartConfig);
    });

    it('logs hasChart true when chart config is generated', async () => {
      const chartSpec = makeChartSpec();
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(makeChartConfig());

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await chatService.ask(STORE_ID, 'Show revenue by product');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ hasChart: true }),
        'Chat service: question answered',
      );
    });
  });

  // ── ask() — without chart spec ──────────────────────────────────

  describe('ask() — without chart spec', () => {
    it('returns null chartSpec when AI provides no chartSpec', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult({ chartSpec: null }));
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'What is my total revenue?');

      expect(result.chartSpec).toBeNull();
      expect(result.chartConfig).toBeNull();
    });
  });

  // ── ask() — input validation ────────────────────────────────────

  describe('ask() — input validation', () => {
    it('throws ValidationError for empty question', async () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, '')).rejects.toThrow('Question cannot be empty');
    });

    it('throws ValidationError for whitespace-only question', async () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, '   ')).rejects.toThrow('Question cannot be empty');
    });

    it('throws ValidationError for undefined question', async () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, undefined as unknown as string)).rejects.toThrow('Question cannot be empty');
    });

    it('does not call pipeline or executor when question is invalid', async () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      try {
        await chatService.ask(STORE_ID, '');
      } catch {
        // expected
      }

      expect(mockPipeline.processQuestion).not.toHaveBeenCalled();
      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });
  });

  // ── ask() — error propagation ───────────────────────────────────

  describe('ask() — error propagation', () => {
    it('propagates AIError from pipeline', async () => {
      const { AIError } = await import('../../../src/utils/errors.js');
      mockPipeline.processQuestion.mockRejectedValue(
        new AIError('Unable to process this question. Please try rephrasing.'),
      );

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, 'Bad question'))
        .rejects.toThrow('Unable to process this question. Please try rephrasing.');
    });

    it('propagates AIError from query executor', async () => {
      const { AIError } = await import('../../../src/utils/errors.js');
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult());
      mockExecutor.execute.mockRejectedValue(
        new AIError('The query took too long to execute. Try asking a simpler question.'),
      );

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, 'Complex question'))
        .rejects.toThrow('The query took too long to execute. Try asking a simpler question.');
    });

    it('propagates ValidationError from pipeline', async () => {
      const { ValidationError } = await import('../../../src/utils/errors.js');
      mockPipeline.processQuestion.mockRejectedValue(
        new ValidationError('Invalid storeId: must be a valid UUID'),
      );

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      await expect(chatService.ask(STORE_ID, 'Revenue?'))
        .rejects.toThrow('Invalid storeId: must be a valid UUID');
    });

    it('does not call executor when pipeline fails', async () => {
      mockPipeline.processQuestion.mockRejectedValue(new Error('Pipeline failure'));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      try {
        await chatService.ask(STORE_ID, 'Something');
      } catch {
        // expected
      }

      expect(mockExecutor.execute).not.toHaveBeenCalled();
    });

    it('does not call toChartConfig when executor fails', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult());
      mockExecutor.execute.mockRejectedValue(new Error('Execution failure'));

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      try {
        await chatService.ask(STORE_ID, 'Something');
      } catch {
        // expected
      }

      expect(mockToChartConfig).not.toHaveBeenCalled();
    });
  });

  // ── ask() — response shape ──────────────────────────────────────

  describe('ask() — response shape', () => {
    it('includes all required fields in response', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult());
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Revenue?');

      expect(result).toHaveProperty('answer');
      expect(result).toHaveProperty('sql');
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('rowCount');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('chartSpec');
      expect(result).toHaveProperty('chartConfig');
    });

    it('returns rows from query executor', async () => {
      const rows = [
        { product: 'Widget', revenue: '1000' },
        { product: 'Gadget', revenue: '500' },
      ];
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult());
      mockExecutor.execute.mockResolvedValue(makeExecutionResult({ rows, rowCount: 2 }));
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Top products?');

      expect(result.rows).toEqual(rows);
      expect(result.rowCount).toBe(2);
    });

    it('returns empty rows when query returns nothing', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult());
      mockExecutor.execute.mockResolvedValue(makeExecutionResult({ rows: [], rowCount: 0 }));
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Future orders?');

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('uses explanation as the answer field', async () => {
      const explanation = 'You had 42 orders this month totaling $5,678.90';
      mockPipeline.processQuestion.mockResolvedValue(
        makeAIQueryResult({ explanation }),
      );
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'How many orders?');

      expect(result.answer).toBe(explanation);
    });

    it('uses SQL from the AI pipeline result', async () => {
      const sql = "SELECT COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status = 'completed'";
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult({ sql }));
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Order count?');

      expect(result.sql).toBe(sql);
    });

    it('uses durationMs from the execution result', async () => {
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult());
      mockExecutor.execute.mockResolvedValue(makeExecutionResult({ durationMs: 128 }));
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Revenue?');

      expect(result.durationMs).toBe(128);
    });
  });

  // ── ask() — chart spec summary ──────────────────────────────────

  describe('ask() — chart spec summary', () => {
    it('extracts type and title from chartSpec for the summary', async () => {
      const chartSpec: ChartSpec = {
        type: 'pie',
        title: 'Revenue by Category',
        dataKey: 'revenue',
        labelKey: 'category',
      };
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Revenue by category');

      expect(result.chartSpec).toEqual({ type: 'pie', title: 'Revenue by Category' });
    });

    it('does not include xLabel/yLabel/dataKey/labelKey in chart spec summary', async () => {
      const chartSpec = makeChartSpec();
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Revenue by product');

      const summary = result.chartSpec as unknown as Record<string, unknown>;
      expect(summary).not.toHaveProperty('xLabel');
      expect(summary).not.toHaveProperty('yLabel');
      expect(summary).not.toHaveProperty('dataKey');
      expect(summary).not.toHaveProperty('labelKey');
    });

    it('handles line chart spec summary', async () => {
      const chartSpec: ChartSpec = {
        type: 'line',
        title: 'Revenue Over Time',
        xLabel: 'Date',
        yLabel: 'Revenue',
        dataKey: 'total',
        labelKey: 'date',
      };
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Revenue over time');

      expect(result.chartSpec).toEqual({ type: 'line', title: 'Revenue Over Time' });
    });

    it('handles doughnut chart spec summary', async () => {
      const chartSpec: ChartSpec = {
        type: 'doughnut',
        title: 'Order Status Breakdown',
        dataKey: 'count',
        labelKey: 'status',
      };
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Order status');

      expect(result.chartSpec).toEqual({ type: 'doughnut', title: 'Order Status Breakdown' });
    });

    it('handles table chart spec summary', async () => {
      const chartSpec: ChartSpec = {
        type: 'table',
        title: 'Top Customers',
        dataKey: 'total_spent',
        labelKey: 'name',
      };
      mockPipeline.processQuestion.mockResolvedValue(makeAIQueryResult({ chartSpec }));
      mockExecutor.execute.mockResolvedValue(makeExecutionResult());
      mockToChartConfig.mockReturnValue(null);

      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      const result = await chatService.ask(STORE_ID, 'Top customers');

      expect(result.chartSpec).toEqual({ type: 'table', title: 'Top Customers' });
    });
  });

  // ── createChatService factory ───────────────────────────────────

  describe('createChatService factory', () => {
    it('returns an object with ask method', () => {
      const chatService = createChatService({
        aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
        queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
      });

      expect(chatService).toHaveProperty('ask');
      expect(typeof chatService.ask).toBe('function');
    });
  });
});
