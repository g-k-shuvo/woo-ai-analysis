import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { AIQueryResult, QueryExecutionResult, ChartSpec, ChartConfiguration, TableResult } from '../../src/ai/types.js';

/**
 * AI Test Suite — Integration Tests
 *
 * Tests the full chatService.ask() chain:
 * question → aiPipeline.processQuestion → queryExecutor.execute → toChartConfig → ChatResponse
 *
 * Mocks at the boundary (pipeline + executor) to verify:
 * - chatService correctly wires all components
 * - Response shape matches the API contract
 * - Chart configs are built correctly from various data shapes
 * - Edge cases (empty results, table charts, large datasets)
 * - Error propagation from pipeline and executor
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
    sql: "SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') LIMIT 1",
    params: [STORE_ID],
    explanation: 'Your total revenue is $45,250.00',
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

function createService(mockPipeline: MockPipeline, mockExecutor: MockExecutor) {
  return createChatService({
    aiPipeline: mockPipeline as unknown as Parameters<typeof createChatService>[0]['aiPipeline'],
    queryExecutor: mockExecutor as unknown as Parameters<typeof createChatService>[0]['queryExecutor'],
  });
}

// ═══════════════════════════════════════════════════════════════
// REVENUE QUERY INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite Integration — Revenue Queries', () => {
  let mockPipeline: MockPipeline;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    const deps = createMockDeps();
    mockPipeline = deps.mockPipeline;
    mockExecutor = deps.mockExecutor;
  });

  it('TC-IR01: total revenue — scalar aggregate, no chart', async () => {
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult());
    mockExecutor.execute.mockResolvedValue(makeExecResult());

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'What is my total revenue?');

    expect(result.answer).toBe('Your total revenue is $45,250.00');
    expect(result.rows).toEqual([{ total_revenue: '45250.00' }]);
    expect(result.rowCount).toBe(1);
    expect(result.durationMs).toBe(25);
    expect(result.chartSpec).toBeNull();
    expect(result.chartConfig).toBeNull();
    expect(result.chartImage).toBeNull();
  });

  it('TC-IR02: monthly revenue — bar chart with correct labels', async () => {
    const chartSpec: ChartSpec = {
      type: 'bar',
      title: 'Monthly Revenue',
      xLabel: 'Month',
      yLabel: 'Revenue ($)',
      dataKey: 'monthly_revenue',
      labelKey: 'month',
    };
    const rows = [
      { month: '2025-11', monthly_revenue: '8200.50' },
      { month: '2025-12', monthly_revenue: '12450.00' },
      { month: '2026-01', monthly_revenue: '15320.75' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec, explanation: 'Monthly revenue breakdown.' }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Monthly revenue last 3 months');

    expect(result.chartSpec).toEqual({ type: 'bar', title: 'Monthly Revenue' });
    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('bar');
    expect(config.data.labels).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(config.data.datasets[0].data).toEqual([8200.5, 12450, 15320.75]);
    expect(config.options.scales?.x.title.text).toBe('Month');
    expect(config.options.scales?.y.title.text).toBe('Revenue ($)');
  });

  it('TC-IR03: daily revenue — line chart', async () => {
    const chartSpec: ChartSpec = {
      type: 'line',
      title: 'Daily Revenue',
      xLabel: 'Date',
      yLabel: 'Revenue',
      dataKey: 'revenue',
      labelKey: 'day',
    };
    const rows = [
      { day: '2026-02-10', revenue: '1820.00' },
      { day: '2026-02-11', revenue: '2105.50' },
      { day: '2026-02-12', revenue: '1450.25' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Daily revenue last 3 days');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('line');
    expect(config.data.datasets[0].data).toEqual([1820, 2105.5, 1450.25]);
  });

  it('TC-IR04: revenue comparison — two period values', async () => {
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({
      explanation: 'Current month: $15,320. Last month: $12,450. Up 23%.',
      chartSpec: null,
    }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({
      rows: [{ period: 'current', revenue: '15320.00', order_count: '145' }],
      rowCount: 1,
    }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Compare revenue');

    expect(result.answer).toContain('15,320');
    expect(result.chartConfig).toBeNull();
  });

  it('TC-IR05: revenue by payment method — pie chart', async () => {
    const chartSpec: ChartSpec = {
      type: 'pie',
      title: 'Revenue by Payment',
      dataKey: 'revenue',
      labelKey: 'payment_method',
    };
    const rows = [
      { payment_method: 'stripe', revenue: '25000.00' },
      { payment_method: 'paypal', revenue: '12000.00' },
      { payment_method: 'cod', revenue: '3500.00' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Revenue by payment method');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('pie');
    expect(config.data.labels).toEqual(['stripe', 'paypal', 'cod']);
    expect(config.options.plugins.legend).toEqual({ display: true, position: 'right' });
  });
});

// ═══════════════════════════════════════════════════════════════
// PRODUCT QUERY INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite Integration — Product Queries', () => {
  let mockPipeline: MockPipeline;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    const deps = createMockDeps();
    mockPipeline = deps.mockPipeline;
    mockExecutor = deps.mockExecutor;
  });

  it('TC-IP01: top products — bar chart with 10 items', async () => {
    const chartSpec: ChartSpec = {
      type: 'bar',
      title: 'Top 10 Products',
      xLabel: 'Product',
      yLabel: 'Units Sold',
      dataKey: 'total_sold',
      labelKey: 'name',
    };
    const rows = Array.from({ length: 10 }, (_, i) => ({
      name: `Product ${i + 1}`,
      total_sold: String(100 - i * 10),
    }));
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec, explanation: 'Top 10 products.' }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 10 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Top 10 products');

    expect(result.rowCount).toBe(10);
    const config = result.chartConfig as ChartConfiguration;
    expect(config.data.labels).toHaveLength(10);
    expect(config.data.datasets[0].data[0]).toBe(100);
    expect(config.data.datasets[0].backgroundColor).toHaveLength(10);
  });

  it('TC-IP02: category performance — pie chart', async () => {
    const chartSpec: ChartSpec = {
      type: 'pie',
      title: 'Category Revenue',
      dataKey: 'revenue',
      labelKey: 'category_name',
    };
    const rows = [
      { category_name: 'Electronics', revenue: '25000' },
      { category_name: 'Clothing', revenue: '15000' },
      { category_name: 'Books', revenue: '5000' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Category performance');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('pie');
    expect(config.data.datasets[0].data).toEqual([25000, 15000, 5000]);
  });

  it('TC-IP03: low stock products — tabular data, no chart', async () => {
    const rows = [
      { name: 'Widget A', sku: 'WA-001', stock_quantity: '2', price: '29.99' },
      { name: 'Widget B', sku: 'WB-002', stock_quantity: '1', price: '49.99' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({
      explanation: 'You have 2 products with low stock.',
      chartSpec: null,
    }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 2 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Low stock products');

    expect(result.rowCount).toBe(2);
    expect(result.chartConfig).toBeNull();
    expect(result.rows[0]).toHaveProperty('name');
    expect(result.rows[0]).toHaveProperty('stock_quantity');
  });

  it('TC-IP04: product table view — table type chart', async () => {
    const chartSpec: ChartSpec = {
      type: 'table',
      title: 'Product Inventory',
      dataKey: 'price',
      labelKey: 'name',
    };
    const rows = [
      { name: 'Widget A', price: '29.99', stock_quantity: '50' },
      { name: 'Widget B', price: '49.99', stock_quantity: '25' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 2 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Show product inventory table');

    const tableResult = result.chartConfig as TableResult;
    expect(tableResult.type).toBe('table');
    expect(tableResult.title).toBe('Product Inventory');
    expect(tableResult.headers).toEqual(['name', 'price', 'stock_quantity']);
    expect(tableResult.rows).toHaveLength(2);
  });

  it('TC-IP05: product sales by period — bar chart', async () => {
    const chartSpec: ChartSpec = {
      type: 'bar',
      title: 'Product Sales This Month',
      xLabel: 'Product',
      yLabel: 'Revenue ($)',
      dataKey: 'total_revenue',
      labelKey: 'name',
    };
    const rows = [
      { name: 'Premium Widget', total_revenue: '4250.00' },
      { name: 'Basic Widget', total_revenue: '2100.00' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 2 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Product sales this month');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('bar');
    expect(config.data.datasets[0].data).toEqual([4250, 2100]);
  });
});

// ═══════════════════════════════════════════════════════════════
// CUSTOMER QUERY INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite Integration — Customer Queries', () => {
  let mockPipeline: MockPipeline;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    const deps = createMockDeps();
    mockPipeline = deps.mockPipeline;
    mockExecutor = deps.mockExecutor;
  });

  it('TC-IC01: new vs returning — doughnut chart', async () => {
    const chartSpec: ChartSpec = {
      type: 'doughnut',
      title: 'New vs Returning',
      dataKey: 'customer_count',
      labelKey: 'customer_type',
    };
    const rows = [
      { customer_type: 'New', customer_count: '340' },
      { customer_type: 'Returning', customer_count: '520' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 2 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'New vs returning customers');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('doughnut');
    expect(config.data.datasets[0].data).toEqual([340, 520]);
    expect(config.data.labels).toEqual(['New', 'Returning']);
  });

  it('TC-IC02: top customers — bar chart using display_name (not email)', async () => {
    const chartSpec: ChartSpec = {
      type: 'bar',
      title: 'Top Customers',
      xLabel: 'Customer',
      yLabel: 'Spent ($)',
      dataKey: 'total_spent',
      labelKey: 'display_name',
    };
    const rows = [
      { display_name: 'John D.', total_spent: '5200.00', order_count: '12' },
      { display_name: 'Jane S.', total_spent: '3800.50', order_count: '8' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 2 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Top customers');

    // Verify no PII fields in response
    expect(result.rows[0]).not.toHaveProperty('email');
    expect(result.rows[0]).not.toHaveProperty('email_hash');
    expect(result.rows[0]).toHaveProperty('display_name');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.data.labels).toEqual(['John D.', 'Jane S.']);
  });

  it('TC-IC03: customer growth — line chart over months', async () => {
    const chartSpec: ChartSpec = {
      type: 'line',
      title: 'Customer Growth',
      xLabel: 'Month',
      yLabel: 'New Customers',
      dataKey: 'new_customers',
      labelKey: 'month',
    };
    const rows = [
      { month: '2025-09', new_customers: '15' },
      { month: '2025-10', new_customers: '22' },
      { month: '2025-11', new_customers: '18' },
      { month: '2025-12', new_customers: '30' },
      { month: '2026-01', new_customers: '25' },
      { month: '2026-02', new_customers: '12' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 6 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Customer growth last 6 months');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('line');
    expect(config.data.labels).toHaveLength(6);
    expect(config.data.datasets[0].data).toEqual([15, 22, 18, 30, 25, 12]);
  });

  it('TC-IC04: customer LTV — scalar aggregate', async () => {
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({
      explanation: 'Average customer lifetime value is $156.50 across 2.3 orders.',
    }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({
      rows: [{ avg_lifetime_value: '156.50', avg_orders: '2.30', total_customers: '120' }],
      rowCount: 1,
    }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Customer LTV');

    expect(result.rowCount).toBe(1);
    expect(result.rows[0]).toHaveProperty('avg_lifetime_value');
  });

  it('TC-IC05: frequent buyers — bar chart', async () => {
    const chartSpec: ChartSpec = {
      type: 'bar',
      title: 'Most Frequent Buyers',
      xLabel: 'Customer',
      yLabel: 'Orders',
      dataKey: 'order_count',
      labelKey: 'display_name',
    };
    const rows = [
      { display_name: 'Alice W.', order_count: '25', total_spent: '3200.00' },
      { display_name: 'Bob M.', order_count: '18', total_spent: '2100.00' },
      { display_name: 'Carol P.', order_count: '15', total_spent: '1800.00' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Most frequent buyers');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.data.datasets[0].data).toEqual([25, 18, 15]);
  });
});

// ═══════════════════════════════════════════════════════════════
// ORDER QUERY INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite Integration — Order Queries', () => {
  let mockPipeline: MockPipeline;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    const deps = createMockDeps();
    mockPipeline = deps.mockPipeline;
    mockExecutor = deps.mockExecutor;
  });

  it('TC-IO01: order status breakdown — pie chart', async () => {
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
      { status: 'pending', order_count: '18' },
      { status: 'refunded', order_count: '12' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 5 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Order status breakdown');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('pie');
    expect(config.data.labels).toHaveLength(5);
    expect(config.data.datasets[0].data).toEqual([450, 85, 32, 18, 12]);
  });

  it('TC-IO02: daily orders — line chart', async () => {
    const chartSpec: ChartSpec = {
      type: 'line',
      title: 'Daily Orders',
      xLabel: 'Day',
      yLabel: 'Orders',
      dataKey: 'order_count',
      labelKey: 'day',
    };
    const rows = [
      { day: '2026-02-05', order_count: '12' },
      { day: '2026-02-06', order_count: '15' },
      { day: '2026-02-07', order_count: '8' },
      { day: '2026-02-08', order_count: '22' },
      { day: '2026-02-09', order_count: '19' },
      { day: '2026-02-10', order_count: '14' },
      { day: '2026-02-11', order_count: '17' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 7 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Daily orders this week');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('line');
    expect(config.data.labels).toHaveLength(7);
  });

  it('TC-IO03: payment methods — pie chart', async () => {
    const chartSpec: ChartSpec = {
      type: 'pie',
      title: 'Payment Methods',
      dataKey: 'usage_count',
      labelKey: 'payment_method',
    };
    const rows = [
      { payment_method: 'stripe', usage_count: '320' },
      { payment_method: 'paypal', usage_count: '180' },
      { payment_method: 'cod', usage_count: '45' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 3 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Payment methods');

    const config = result.chartConfig as ChartConfiguration;
    expect(config.type).toBe('pie');
    expect(config.data.labels).toEqual(['stripe', 'paypal', 'cod']);
  });

  it('TC-IO04: recent orders — table data, no chart', async () => {
    const rows = [
      { wc_order_id: '1001', date_created: '2026-02-12T10:30:00Z', status: 'completed', total: '89.99' },
      { wc_order_id: '1000', date_created: '2026-02-12T09:15:00Z', status: 'processing', total: '156.50' },
    ];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({
      explanation: 'Your 2 most recent orders.',
      chartSpec: null,
    }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 2 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Recent orders');

    expect(result.chartConfig).toBeNull();
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toHaveProperty('wc_order_id');
  });

  it('TC-IO05: refund rate — scalar aggregate', async () => {
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({
      explanation: 'Your refund rate is 2.5%.',
    }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({
      rows: [{ refund_rate: '2.50', refunded_count: '12', total_orders: '480' }],
      rowCount: 1,
    }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Refund rate');

    expect(result.answer).toContain('2.5%');
    expect(result.rows[0]).toHaveProperty('refund_rate');
  });
});

// ═══════════════════════════════════════════════════════════════
// EDGE CASE & ERROR INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite Integration — Edge Cases & Errors', () => {
  let mockPipeline: MockPipeline;
  let mockExecutor: MockExecutor;

  beforeEach(() => {
    jest.clearAllMocks();
    const deps = createMockDeps();
    mockPipeline = deps.mockPipeline;
    mockExecutor = deps.mockExecutor;
  });

  it('TC-IE01: empty result set — rows is [] not null', async () => {
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({
      explanation: 'No orders found for that period.',
    }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows: [], rowCount: 0 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Revenue in 2099');

    expect(result.rows).toEqual([]);
    expect(result.rows).not.toBeNull();
    expect(result.rowCount).toBe(0);
    expect(result.chartConfig).toBeNull();
  });

  it('TC-IE02: chartSpec present but empty rows — chartConfig is null', async () => {
    const chartSpec: ChartSpec = {
      type: 'bar',
      title: 'Revenue',
      dataKey: 'revenue',
      labelKey: 'name',
    };
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows: [], rowCount: 0 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Products sold');

    expect(result.chartConfig).toBeNull();
  });

  it('TC-IE03: mismatched dataKey — chartConfig is null', async () => {
    const chartSpec: ChartSpec = {
      type: 'bar',
      title: 'Revenue',
      dataKey: 'nonexistent_column',
      labelKey: 'name',
    };
    const rows = [{ name: 'Widget', revenue: '1000' }];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 1 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Revenue');

    expect(result.chartConfig).toBeNull();
  });

  it('TC-IE04: pipeline AIError propagates to caller', async () => {
    mockPipeline.processQuestion.mockRejectedValue(
      new AIError('Unable to process this question. Please try rephrasing.'),
    );

    const chatService = createService(mockPipeline, mockExecutor);

    await expect(chatService.ask(STORE_ID, 'gibberish xyz'))
      .rejects.toBeInstanceOf(AIError);
    expect(mockExecutor.execute).not.toHaveBeenCalled();
  });

  it('TC-IE05: executor timeout error propagates', async () => {
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult());
    mockExecutor.execute.mockRejectedValue(
      new AIError('The query took too long to execute. Try asking a simpler question.'),
    );

    const chatService = createService(mockPipeline, mockExecutor);

    await expect(chatService.ask(STORE_ID, 'Complex query'))
      .rejects.toThrow('The query took too long to execute.');
  });

  it('TC-IE06: empty question — ValidationError', async () => {
    const chatService = createService(mockPipeline, mockExecutor);

    await expect(chatService.ask(STORE_ID, '')).rejects.toBeInstanceOf(ValidationError);
    await expect(chatService.ask(STORE_ID, '   ')).rejects.toBeInstanceOf(ValidationError);
  });

  it('TC-IE07: large dataset with truncation', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      name: `Product ${i + 1}`,
      revenue: String((100 - i) * 100),
    }));
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({
      explanation: 'Top 100 products.',
      chartSpec: {
        type: 'bar',
        title: 'All Products',
        xLabel: 'Product',
        yLabel: 'Revenue',
        dataKey: 'revenue',
        labelKey: 'name',
      },
    }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({
      rows,
      rowCount: 100,
      truncated: true,
    }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'All products');

    expect(result.rowCount).toBe(100);
    const config = result.chartConfig as ChartConfiguration;
    expect(config.data.labels).toHaveLength(100);
  });

  it('TC-IE08: response contract — all fields present', async () => {
    const chartSpec: ChartSpec = {
      type: 'bar',
      title: 'Test',
      xLabel: 'X',
      yLabel: 'Y',
      dataKey: 'value',
      labelKey: 'label',
    };
    const rows = [{ label: 'A', value: '100' }];
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({
      chartSpec,
      explanation: 'Test answer.',
    }));
    mockExecutor.execute.mockResolvedValue(makeExecResult({ rows, rowCount: 1, durationMs: 42 }));

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Test');

    // All ChatResponse fields must be present
    expect(typeof result.answer).toBe('string');
    expect(typeof result.sql).toBe('string');
    expect(Array.isArray(result.rows)).toBe(true);
    expect(typeof result.rowCount).toBe('number');
    expect(typeof result.durationMs).toBe('number');
    expect(result.chartSpec).toEqual({ type: 'bar', title: 'Test' });
    expect(result.chartConfig).not.toBeNull();
    expect(result.chartImage).toBeNull(); // no renderer provided
    expect(result.chartMeta).toEqual({
      dataKey: 'value',
      labelKey: 'label',
      xLabel: 'X',
      yLabel: 'Y',
    });
  });

  it('TC-IE09: chartMeta is null when no chartSpec', async () => {
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ chartSpec: null }));
    mockExecutor.execute.mockResolvedValue(makeExecResult());

    const chatService = createService(mockPipeline, mockExecutor);
    const result = await chatService.ask(STORE_ID, 'Total revenue');

    expect(result.chartMeta).toBeNull();
    expect(result.chartSpec).toBeNull();
  });

  it('TC-IE10: tenant isolation — storeId passes through pipeline', async () => {
    const specificStoreId = '123e4567-e89b-12d3-a456-426614174000';
    mockPipeline.processQuestion.mockResolvedValue(makeAIResult({ params: [specificStoreId] }));
    mockExecutor.execute.mockResolvedValue(makeExecResult());

    const chatService = createService(mockPipeline, mockExecutor);
    await chatService.ask(specificStoreId, 'Revenue');

    expect(mockPipeline.processQuestion).toHaveBeenCalledWith(specificStoreId, 'Revenue');
  });
});
