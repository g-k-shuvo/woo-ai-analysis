import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/**
 * AI Test Suite — 50+ question→answer test cases.
 *
 * Tests the full AI pipeline:  question → OpenAI mock → SQL validation → AIQueryResult
 *
 * Every test verifies:
 * - SQL is SELECT-only
 * - SQL contains store_id = $1
 * - SQL has a LIMIT clause
 * - Response has sql, params, explanation, and chartSpec
 * - Chart spec (when present) has valid type, dataKey, labelKey
 */

// Mock logger before importing the module under test
jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createAIQueryPipeline } = await import('../../../src/ai/pipeline.js');
const { validateSql } = await import('../../../src/ai/sqlValidator.js');

const VALID_STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

// ── Mock helpers ──────────────────────────────────────────────

function makeStoreContext() {
  return {
    storeId: VALID_STORE_ID,
    currency: 'USD',
    totalOrders: 250,
    totalProducts: 80,
    totalCustomers: 120,
    totalCategories: 10,
    earliestOrderDate: '2025-01-01T00:00:00Z',
    latestOrderDate: '2026-02-12T23:59:59Z',
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

interface TestCase {
  question: string;
  sql: string;
  explanation: string;
  chartSpec: {
    type: 'bar' | 'line' | 'pie' | 'doughnut' | 'table';
    title: string;
    xLabel?: string;
    yLabel?: string;
    dataKey: string;
    labelKey: string;
  } | null;
}

/** Runs a single question through the pipeline and asserts standard invariants. */
async function runTestCase(tc: TestCase) {
  const openaiResponse = JSON.stringify({
    sql: tc.sql,
    explanation: tc.explanation,
    chartSpec: tc.chartSpec,
  });

  const mockOpenAI = createMockOpenAI(openaiResponse);
  const mockSchemaContext = createMockSchemaContextService();

  const pipeline = createAIQueryPipeline({
    openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    schemaContextService: mockSchemaContext,
  });

  const result = await pipeline.processQuestion(VALID_STORE_ID, tc.question);

  // Core invariants every test must satisfy
  expect(result.sql.toUpperCase()).toMatch(/^SELECT\b/);
  expect(result.sql).toMatch(/\bstore_id\s*=\s*\$1\b/);
  expect(result.sql.toUpperCase()).toMatch(/\bLIMIT\s+\d+/);
  expect(result.params).toEqual([VALID_STORE_ID]);
  expect(typeof result.explanation).toBe('string');
  expect(result.explanation.length).toBeGreaterThan(0);

  if (tc.chartSpec) {
    expect(result.chartSpec).not.toBeNull();
    expect(result.chartSpec!.type).toBe(tc.chartSpec.type);
    expect(result.chartSpec!.dataKey).toBe(tc.chartSpec.dataKey);
    expect(result.chartSpec!.labelKey).toBe(tc.chartSpec.labelKey);
  } else {
    expect(result.chartSpec).toBeNull();
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// REVENUE TEST CASES (10)
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite — Revenue Questions', () => {
  it('TC-R01: What is my total revenue?', async () => {
    await runTestCase({
      question: 'What is my total revenue?',
      sql: "SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') LIMIT 1",
      explanation: 'Sums the total column for completed and processing orders.',
      chartSpec: null,
    });
  });

  it('TC-R02: What was my revenue last month?', async () => {
    await runTestCase({
      question: 'What was my revenue last month?',
      sql: "SELECT SUM(total) AS monthly_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND date_created < DATE_TRUNC('month', NOW()) LIMIT 1",
      explanation: 'Sums revenue for the previous calendar month.',
      chartSpec: null,
    });
  });

  it('TC-R03: Show me daily revenue for the last 7 days', async () => {
    await runTestCase({
      question: 'Show me daily revenue for the last 7 days',
      sql: "SELECT DATE(date_created) AS day, SUM(total) AS daily_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= NOW() - INTERVAL '7 days' GROUP BY DATE(date_created) ORDER BY day ASC LIMIT 7",
      explanation: 'Groups revenue by day for the last 7 days.',
      chartSpec: {
        type: 'line',
        title: 'Daily Revenue (Last 7 Days)',
        xLabel: 'Day',
        yLabel: 'Revenue ($)',
        dataKey: 'daily_revenue',
        labelKey: 'day',
      },
    });
  });

  it('TC-R04: What is my average order value?', async () => {
    await runTestCase({
      question: 'What is my average order value?',
      sql: "SELECT ROUND(AVG(total), 2) AS avg_order_value FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') LIMIT 1",
      explanation: 'Calculates the average total across completed/processing orders.',
      chartSpec: null,
    });
  });

  it('TC-R05: Compare this month revenue to last month', async () => {
    await runTestCase({
      question: 'Compare this month revenue to last month',
      sql: "SELECT 'current' AS period, COALESCE(ROUND(SUM(total), 2), 0) AS revenue, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('month', NOW()) AND date_created < NOW() LIMIT 1",
      explanation: 'Current month revenue for comparison.',
      chartSpec: null,
    });
  });

  it('TC-R06: Show me monthly revenue for the last 6 months', async () => {
    await runTestCase({
      question: 'Show me monthly revenue for the last 6 months',
      sql: "SELECT DATE_TRUNC('month', date_created) AS month, ROUND(SUM(total), 2) AS monthly_revenue, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= NOW() - INTERVAL '6 months' GROUP BY DATE_TRUNC('month', date_created) ORDER BY month ASC LIMIT 6",
      explanation: 'Groups revenue by month for the last 6 months.',
      chartSpec: {
        type: 'bar',
        title: 'Monthly Revenue (Last 6 Months)',
        xLabel: 'Month',
        yLabel: 'Revenue ($)',
        dataKey: 'monthly_revenue',
        labelKey: 'month',
      },
    });
  });

  it('TC-R07: What was my revenue this week?', async () => {
    await runTestCase({
      question: 'What was my revenue this week?',
      sql: "SELECT COALESCE(ROUND(SUM(total), 2), 0) AS weekly_revenue, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('week', NOW()) LIMIT 1",
      explanation: 'Sums revenue from the start of the current week to now.',
      chartSpec: null,
    });
  });

  it('TC-R08: What was my revenue today?', async () => {
    await runTestCase({
      question: 'What was my revenue today?',
      sql: "SELECT COALESCE(ROUND(SUM(total), 2), 0) AS todays_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('day', NOW()) LIMIT 1",
      explanation: 'Sums revenue from the start of today (UTC).',
      chartSpec: null,
    });
  });

  it('TC-R09: What was my revenue this year?', async () => {
    await runTestCase({
      question: 'What was my revenue this year?',
      sql: "SELECT COALESCE(ROUND(SUM(total), 2), 0) AS yearly_revenue, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('year', NOW()) LIMIT 1",
      explanation: 'Sums revenue from the start of the current year.',
      chartSpec: null,
    });
  });

  it('TC-R10: Show revenue breakdown by payment method', async () => {
    await runTestCase({
      question: 'Show revenue breakdown by payment method',
      sql: "SELECT payment_method, ROUND(SUM(total), 2) AS revenue, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND payment_method IS NOT NULL GROUP BY payment_method ORDER BY revenue DESC LIMIT 20",
      explanation: 'Revenue grouped by payment method.',
      chartSpec: {
        type: 'pie',
        title: 'Revenue by Payment Method',
        dataKey: 'revenue',
        labelKey: 'payment_method',
      },
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// PRODUCT TEST CASES (10)
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite — Product Questions', () => {
  it('TC-P01: What are my top 10 selling products?', async () => {
    await runTestCase({
      question: 'What are my top 10 selling products?',
      sql: "SELECT p.name, SUM(oi.quantity) AS total_sold, SUM(oi.total) AS total_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 WHERE oi.store_id = $1 AND o.status IN ('completed', 'processing') GROUP BY p.name ORDER BY total_sold DESC LIMIT 10",
      explanation: 'Joins order_items with products to get top sellers by quantity.',
      chartSpec: {
        type: 'bar',
        title: 'Top 10 Products by Sales',
        xLabel: 'Product',
        yLabel: 'Units Sold',
        dataKey: 'total_sold',
        labelKey: 'name',
      },
    });
  });

  it('TC-P02: Which product categories generate the most revenue?', async () => {
    await runTestCase({
      question: 'Which product categories generate the most revenue?',
      sql: "SELECT p.category_name, SUM(oi.total) AS category_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 WHERE oi.store_id = $1 AND o.status IN ('completed', 'processing') AND p.category_name IS NOT NULL GROUP BY p.category_name ORDER BY category_revenue DESC LIMIT 20",
      explanation: 'Groups order_items revenue by product category.',
      chartSpec: {
        type: 'pie',
        title: 'Revenue by Category',
        dataKey: 'category_revenue',
        labelKey: 'category_name',
      },
    });
  });

  it('TC-P03: How many products do I have in stock?', async () => {
    await runTestCase({
      question: 'How many products do I have in stock?',
      sql: "SELECT COUNT(*) AS in_stock_count FROM products WHERE store_id = $1 AND stock_status = 'instock' AND status = 'publish' LIMIT 1",
      explanation: 'Counts published products with instock status.',
      chartSpec: null,
    });
  });

  it('TC-P04: What are my top 5 products by revenue?', async () => {
    await runTestCase({
      question: 'What are my top 5 products by revenue?',
      sql: "SELECT p.name, ROUND(SUM(oi.total), 2) AS total_revenue, SUM(oi.quantity) AS total_sold FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 WHERE oi.store_id = $1 AND o.status IN ('completed', 'processing') GROUP BY p.name ORDER BY total_revenue DESC LIMIT 5",
      explanation: 'Top 5 products by revenue.',
      chartSpec: {
        type: 'bar',
        title: 'Top 5 Products by Revenue',
        xLabel: 'Product',
        yLabel: 'Revenue ($)',
        dataKey: 'total_revenue',
        labelKey: 'name',
      },
    });
  });

  it('TC-P05: Which products are low on stock?', async () => {
    await runTestCase({
      question: 'Which products are low on stock?',
      sql: "SELECT name, sku, stock_quantity, COALESCE(price, 0) AS price FROM products WHERE store_id = $1 AND stock_status = 'instock' AND status = 'publish' AND stock_quantity IS NOT NULL AND stock_quantity <= 5 ORDER BY stock_quantity ASC LIMIT 20",
      explanation: 'Lists published products with stock at or below 5 units.',
      chartSpec: null,
    });
  });

  it('TC-P06: Which products are out of stock?', async () => {
    await runTestCase({
      question: 'Which products are out of stock?',
      sql: "SELECT name, sku, COALESCE(price, 0) AS price FROM products WHERE store_id = $1 AND stock_status = 'outofstock' AND status = 'publish' ORDER BY name ASC LIMIT 50",
      explanation: 'Lists published products currently marked as out of stock.',
      chartSpec: null,
    });
  });

  it('TC-P07: What were my best selling products last month?', async () => {
    await runTestCase({
      question: 'What were my best selling products last month?',
      sql: "SELECT p.name, SUM(oi.quantity) AS total_sold, ROUND(SUM(oi.total), 2) AS total_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 WHERE oi.store_id = $1 AND o.status IN ('completed', 'processing') AND o.date_created >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND o.date_created < DATE_TRUNC('month', NOW()) GROUP BY p.name ORDER BY total_sold DESC LIMIT 10",
      explanation: 'Top selling products from the previous calendar month.',
      chartSpec: {
        type: 'bar',
        title: 'Best Selling Products Last Month',
        xLabel: 'Product',
        yLabel: 'Units Sold',
        dataKey: 'total_sold',
        labelKey: 'name',
      },
    });
  });

  it('TC-P08: How many products do I have?', async () => {
    await runTestCase({
      question: 'How many products do I have?',
      sql: "SELECT COUNT(*) AS total_products FROM products WHERE store_id = $1 AND status = 'publish' LIMIT 1",
      explanation: 'Counts published products for this store.',
      chartSpec: null,
    });
  });

  it('TC-P09: Show me products with no sales', async () => {
    await runTestCase({
      question: 'Show me products with no sales',
      sql: "SELECT p.name, p.sku, p.price FROM products p WHERE p.store_id = $1 AND p.status = 'publish' AND p.id NOT IN (SELECT DISTINCT oi.product_id FROM order_items oi WHERE oi.store_id = $1 AND oi.product_id IS NOT NULL) ORDER BY p.name ASC LIMIT 50",
      explanation: 'Lists published products that have never been sold.',
      chartSpec: null,
    });
  });

  it('TC-P10: What is the average product price?', async () => {
    await runTestCase({
      question: 'What is the average product price?',
      sql: "SELECT ROUND(AVG(price), 2) AS avg_price, COUNT(*) AS total_products FROM products WHERE store_id = $1 AND status = 'publish' AND price IS NOT NULL LIMIT 1",
      explanation: 'Calculates the average price of published products.',
      chartSpec: null,
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// CUSTOMER TEST CASES (10)
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite — Customer Questions', () => {
  it('TC-C01: How many new vs returning customers do I have?', async () => {
    await runTestCase({
      question: 'How many new vs returning customers do I have?',
      sql: "SELECT CASE WHEN order_count = 1 THEN 'New' ELSE 'Repeat' END AS customer_type, COUNT(*) AS customer_count FROM customers WHERE store_id = $1 AND order_count > 0 GROUP BY customer_type LIMIT 2",
      explanation: 'Classifies customers as New (1 order) or Repeat (2+ orders).',
      chartSpec: {
        type: 'doughnut',
        title: 'New vs Returning Customers',
        dataKey: 'customer_count',
        labelKey: 'customer_type',
      },
    });
  });

  it('TC-C02: Who are my top 10 customers by spending?', async () => {
    await runTestCase({
      question: 'Who are my top 10 customers by spending?',
      sql: "SELECT display_name, total_spent, order_count FROM customers WHERE store_id = $1 AND order_count > 0 ORDER BY total_spent DESC LIMIT 10",
      explanation: 'Lists customers ordered by total_spent. Uses display_name to avoid PII.',
      chartSpec: {
        type: 'bar',
        title: 'Top 10 Customers by Spending',
        xLabel: 'Customer',
        yLabel: 'Total Spent ($)',
        dataKey: 'total_spent',
        labelKey: 'display_name',
      },
    });
  });

  it('TC-C03: How many customers placed their first order this month?', async () => {
    await runTestCase({
      question: 'How many customers placed their first order this month?',
      sql: "SELECT COUNT(*) AS new_customers FROM customers WHERE store_id = $1 AND first_order_date >= DATE_TRUNC('month', NOW()) LIMIT 1",
      explanation: 'Counts customers whose first_order_date is in the current month.',
      chartSpec: null,
    });
  });

  it('TC-C04: Who are my most frequent buyers?', async () => {
    await runTestCase({
      question: 'Who are my most frequent buyers?',
      sql: "SELECT display_name, order_count, ROUND(total_spent, 2) AS total_spent FROM customers WHERE store_id = $1 AND order_count > 0 ORDER BY order_count DESC LIMIT 10",
      explanation: 'Lists customers ordered by order_count. Uses display_name to avoid PII.',
      chartSpec: {
        type: 'bar',
        title: 'Most Frequent Buyers',
        xLabel: 'Customer',
        yLabel: 'Order Count',
        dataKey: 'order_count',
        labelKey: 'display_name',
      },
    });
  });

  it('TC-C05: What is my average customer lifetime value?', async () => {
    await runTestCase({
      question: 'What is my average customer lifetime value?',
      sql: "SELECT ROUND(AVG(total_spent), 2) AS avg_lifetime_value, ROUND(AVG(order_count), 2) AS avg_orders, COUNT(*) AS total_customers FROM customers WHERE store_id = $1 AND order_count > 0 LIMIT 1",
      explanation: 'Calculates average total_spent and order_count across customers with orders.',
      chartSpec: null,
    });
  });

  it('TC-C06: How many new customers did I get last week?', async () => {
    await runTestCase({
      question: 'How many new customers did I get last week?',
      sql: "SELECT COUNT(*) AS new_customers FROM customers WHERE store_id = $1 AND first_order_date >= DATE_TRUNC('week', NOW()) - INTERVAL '1 week' AND first_order_date < DATE_TRUNC('week', NOW()) LIMIT 1",
      explanation: 'Counts customers whose first_order_date was in the previous week.',
      chartSpec: null,
    });
  });

  it('TC-C07: How many total customers do I have?', async () => {
    await runTestCase({
      question: 'How many total customers do I have?',
      sql: "SELECT COUNT(*) AS total_customers FROM customers WHERE store_id = $1 AND order_count > 0 LIMIT 1",
      explanation: 'Counts all customers with at least one order.',
      chartSpec: null,
    });
  });

  it('TC-C08: Show me customer growth over the last 6 months', async () => {
    await runTestCase({
      question: 'Show me customer growth over the last 6 months',
      sql: "SELECT DATE_TRUNC('month', first_order_date) AS month, COUNT(*) AS new_customers FROM customers WHERE store_id = $1 AND first_order_date >= NOW() - INTERVAL '6 months' GROUP BY DATE_TRUNC('month', first_order_date) ORDER BY month ASC LIMIT 6",
      explanation: 'New customers grouped by month for the last 6 months.',
      chartSpec: {
        type: 'line',
        title: 'Customer Growth (Last 6 Months)',
        xLabel: 'Month',
        yLabel: 'New Customers',
        dataKey: 'new_customers',
        labelKey: 'month',
      },
    });
  });

  it('TC-C09: What is the average number of orders per customer?', async () => {
    await runTestCase({
      question: 'What is the average number of orders per customer?',
      sql: "SELECT ROUND(AVG(order_count), 2) AS avg_orders_per_customer FROM customers WHERE store_id = $1 AND order_count > 0 LIMIT 1",
      explanation: 'Average order count across customers with at least one order.',
      chartSpec: null,
    });
  });

  it('TC-C10: Who are my highest-value customers this year?', async () => {
    await runTestCase({
      question: 'Who are my highest-value customers this year?',
      sql: "SELECT c.display_name, ROUND(SUM(o.total), 2) AS year_spending, COUNT(*) AS order_count FROM orders o JOIN customers c ON o.customer_id = c.id AND c.store_id = $1 WHERE o.store_id = $1 AND o.status IN ('completed', 'processing') AND o.date_created >= DATE_TRUNC('year', NOW()) GROUP BY c.display_name ORDER BY year_spending DESC LIMIT 10",
      explanation: 'Top customers by spending in the current year.',
      chartSpec: {
        type: 'bar',
        title: 'Top Customers This Year',
        xLabel: 'Customer',
        yLabel: 'Spending ($)',
        dataKey: 'year_spending',
        labelKey: 'display_name',
      },
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// ORDER TEST CASES (10)
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite — Order Questions', () => {
  it('TC-O01: How many orders did I get today?', async () => {
    await runTestCase({
      question: 'How many orders did I get today?',
      sql: "SELECT COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND date_created >= DATE_TRUNC('day', NOW()) LIMIT 1",
      explanation: 'Counts orders created since the start of today (UTC).',
      chartSpec: null,
    });
  });

  it('TC-O02: What is the breakdown of orders by status?', async () => {
    await runTestCase({
      question: 'What is the breakdown of orders by status?',
      sql: "SELECT status, COUNT(*) AS order_count FROM orders WHERE store_id = $1 GROUP BY status ORDER BY order_count DESC LIMIT 100",
      explanation: 'Groups all orders by status for this store.',
      chartSpec: {
        type: 'pie',
        title: 'Orders by Status',
        dataKey: 'order_count',
        labelKey: 'status',
      },
    });
  });

  it('TC-O03: Which payment methods are most popular?', async () => {
    await runTestCase({
      question: 'Which payment methods are most popular?',
      sql: "SELECT payment_method, COUNT(*) AS usage_count FROM orders WHERE store_id = $1 AND payment_method IS NOT NULL GROUP BY payment_method ORDER BY usage_count DESC LIMIT 10",
      explanation: 'Counts orders by payment method, excluding nulls.',
      chartSpec: {
        type: 'pie',
        title: 'Payment Methods',
        dataKey: 'usage_count',
        labelKey: 'payment_method',
      },
    });
  });

  it('TC-O04: How many orders did I get this month?', async () => {
    await runTestCase({
      question: 'How many orders did I get this month?',
      sql: "SELECT COUNT(*) AS order_count, COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('month', NOW()) LIMIT 1",
      explanation: 'Counts completed/processing orders from the start of the current month.',
      chartSpec: null,
    });
  });

  it('TC-O05: Show me my recent orders', async () => {
    await runTestCase({
      question: 'Show me my recent orders',
      sql: "SELECT wc_order_id, date_created, status, ROUND(total, 2) AS total FROM orders WHERE store_id = $1 ORDER BY date_created DESC LIMIT 10",
      explanation: 'Lists the 10 most recent orders.',
      chartSpec: null,
    });
  });

  it('TC-O06: How many orders are pending?', async () => {
    await runTestCase({
      question: 'How many orders are pending?',
      sql: "SELECT COUNT(*) AS pending_count FROM orders WHERE store_id = $1 AND status = 'pending' LIMIT 1",
      explanation: 'Counts orders with pending status.',
      chartSpec: null,
    });
  });

  it('TC-O07: What percentage of orders were refunded?', async () => {
    await runTestCase({
      question: 'What percentage of orders were refunded?',
      sql: "SELECT ROUND(COUNT(*) FILTER (WHERE status = 'refunded') * 100.0 / NULLIF(COUNT(*), 0), 2) AS refund_rate, COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_count, COUNT(*) AS total_orders FROM orders WHERE store_id = $1 LIMIT 1",
      explanation: 'Calculates refund rate as percentage of total orders.',
      chartSpec: null,
    });
  });

  it('TC-O08: Show me daily order count for the last 14 days', async () => {
    await runTestCase({
      question: 'Show me daily order count for the last 14 days',
      sql: "SELECT DATE(date_created) AS day, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND date_created >= NOW() - INTERVAL '14 days' GROUP BY DATE(date_created) ORDER BY day ASC LIMIT 14",
      explanation: 'Daily order counts for the last 14 days.',
      chartSpec: {
        type: 'line',
        title: 'Daily Orders (Last 14 Days)',
        xLabel: 'Day',
        yLabel: 'Order Count',
        dataKey: 'order_count',
        labelKey: 'day',
      },
    });
  });

  it('TC-O09: What is my order cancellation rate?', async () => {
    await runTestCase({
      question: 'What is my order cancellation rate?',
      sql: "SELECT ROUND(COUNT(*) FILTER (WHERE status = 'cancelled') * 100.0 / NULLIF(COUNT(*), 0), 2) AS cancellation_rate, COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count, COUNT(*) AS total_orders FROM orders WHERE store_id = $1 LIMIT 1",
      explanation: 'Calculates cancellation rate as percentage of total orders.',
      chartSpec: null,
    });
  });

  it('TC-O10: Show me orders using coupons', async () => {
    await runTestCase({
      question: 'Show me orders using coupons',
      sql: "SELECT coupon_used, COUNT(*) AS order_count, ROUND(SUM(discount_total), 2) AS total_discount FROM orders WHERE store_id = $1 AND coupon_used IS NOT NULL GROUP BY coupon_used ORDER BY order_count DESC LIMIT 20",
      explanation: 'Lists coupon usage with order counts and total discounts.',
      chartSpec: {
        type: 'bar',
        title: 'Coupon Usage',
        xLabel: 'Coupon',
        yLabel: 'Order Count',
        dataKey: 'order_count',
        labelKey: 'coupon_used',
      },
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// SECURITY TEST CASES (10)
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite — Security', () => {
  let mockSchemaContext: ReturnType<typeof createMockSchemaContextService>;

  beforeEach(() => {
    mockSchemaContext = createMockSchemaContextService();
  });

  it('TC-S01: SQL injection attempt — DROP TABLE', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "SELECT 1; DROP TABLE orders WHERE store_id = $1",
      explanation: 'Hacked!',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'Drop tables'))
      .rejects.toThrow('Unable to process this question');
  });

  it('TC-S02: SQL injection attempt — UNION SELECT', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "SELECT * FROM orders WHERE store_id = $1 UNION SELECT * FROM pg_catalog.pg_tables LIMIT 100",
      explanation: 'Lists tables.',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'Show system tables'))
      .rejects.toThrow('Unable to process this question');
  });

  it('TC-S03: SQL injection attempt — DELETE FROM', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "DELETE FROM customers WHERE store_id = $1",
      explanation: 'Deletes customers.',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'Delete customers'))
      .rejects.toThrow('Unable to process this question');
  });

  it('TC-S04: SQL injection attempt — UPDATE records', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "UPDATE orders SET total = 0 WHERE store_id = $1",
      explanation: 'Updates orders.',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'Set all totals to zero'))
      .rejects.toThrow('Unable to process this question');
  });

  it('TC-S05: Missing store_id — tenant isolation violation', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "SELECT COUNT(*) FROM orders LIMIT 1",
      explanation: 'Count all orders.',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'How many orders?'))
      .rejects.toThrow('Unable to process this question');
  });

  it('TC-S06: Dangerous function — pg_read_file', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "SELECT pg_read_file('/etc/passwd') FROM orders WHERE store_id = $1 LIMIT 1",
      explanation: 'Reads system file.',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'Read password file'))
      .rejects.toThrow('Unable to process this question');
  });

  it('TC-S07: Dangerous function — dblink', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "SELECT dblink('host=evil.com dbname=hack', 'SELECT 1') FROM orders WHERE store_id = $1 LIMIT 1",
      explanation: 'External connection.',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'Connect to external DB'))
      .rejects.toThrow('Unable to process this question');
  });

  it('TC-S08: SQL comment injection', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "SELECT COUNT(*) FROM orders WHERE store_id = $1 -- AND status = 'completed' LIMIT 1",
      explanation: 'Sneaky comment.',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'Count orders'))
      .rejects.toThrow('Unable to process this question');
  });

  it('TC-S09: SELECT INTO — table creation attempt', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "SELECT * INTO new_table FROM orders WHERE store_id = $1 LIMIT 100",
      explanation: 'Creates a new table.',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'Copy orders'))
      .rejects.toThrow('Unable to process this question');
  });

  it('TC-S10: Multi-statement SQL injection', async () => {
    const mockOpenAI = createMockOpenAI(JSON.stringify({
      sql: "SELECT 1 FROM orders WHERE store_id = $1; INSERT INTO orders (store_id) VALUES ($1)",
      explanation: 'Multi-statement attack.',
      chartSpec: null,
    }));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      schemaContextService: mockSchemaContext,
    });

    await expect(pipeline.processQuestion(VALID_STORE_ID, 'Create fake order'))
      .rejects.toThrow('Unable to process this question');
  });
});

// ═══════════════════════════════════════════════════════════════
// SQL VALIDATOR DIRECT TESTS (12) — validate the validator itself
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite — SQL Validator Direct', () => {
  it('TC-V01: Valid SELECT with store_id and LIMIT passes', () => {
    const result = validateSql("SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('TC-V02: Appends LIMIT 100 when missing', () => {
    const result = validateSql("SELECT COUNT(*) FROM orders WHERE store_id = $1");
    expect(result.valid).toBe(true);
    expect(result.sql).toContain('LIMIT 100');
  });

  it('TC-V03: Caps LIMIT at 1000', () => {
    const result = validateSql("SELECT * FROM orders WHERE store_id = $1 LIMIT 5000");
    expect(result.valid).toBe(true);
    expect(result.sql).toContain('LIMIT 1000');
  });

  it('TC-V04: Rejects empty SQL', () => {
    const result = validateSql('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('SQL query is empty');
  });

  it('TC-V05: Rejects INSERT keyword', () => {
    const result = validateSql("INSERT INTO orders (store_id) VALUES ($1)");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('INSERT'))).toBe(true);
  });

  it('TC-V06: Rejects TRUNCATE keyword', () => {
    const result = validateSql("TRUNCATE orders");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('TRUNCATE'))).toBe(true);
  });

  it('TC-V07: Rejects GRANT keyword', () => {
    const result = validateSql("GRANT ALL ON orders TO public");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('GRANT'))).toBe(true);
  });

  it('TC-V08: Rejects pg_sleep function', () => {
    const result = validateSql("SELECT pg_sleep(10) FROM orders WHERE store_id = $1 LIMIT 1");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('pg_sleep'))).toBe(true);
  });

  it('TC-V09: Rejects non-ASCII characters', () => {
    const result = validateSql("SELECT * FROM orders WHERE store_id = $1 AND n\u0430me = 'test' LIMIT 1");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ASCII'))).toBe(true);
  });

  it('TC-V10: Strips trailing semicolons safely', () => {
    const result = validateSql("SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1;");
    expect(result.valid).toBe(true);
    expect(result.sql).not.toMatch(/;\s*$/);
  });

  it('TC-V11: Rejects COPY keyword', () => {
    const result = validateSql("COPY orders TO '/tmp/data.csv'");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('COPY'))).toBe(true);
  });

  it('TC-V12: Rejects CTE (WITH) queries', () => {
    const result = validateSql("WITH cte AS (SELECT * FROM orders WHERE store_id = $1) SELECT * FROM cte LIMIT 10");
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('CTE'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// EDGE CASE TEST CASES (10)
// ═══════════════════════════════════════════════════════════════

describe('AI Test Suite — Edge Cases', () => {

  it('TC-E01: Handles query returning aggregate null (no data)', async () => {
    await runTestCase({
      question: 'What was my revenue in 2099?',
      sql: "SELECT COALESCE(SUM(total), 0) AS total_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= '2099-01-01' LIMIT 1",
      explanation: 'No orders found for 2099, so revenue is $0.',
      chartSpec: null,
    });
  });

  it('TC-E02: Handles query with table type chart spec', async () => {
    await runTestCase({
      question: 'Show me a summary table of orders',
      sql: "SELECT wc_order_id, date_created, status, ROUND(total, 2) AS total FROM orders WHERE store_id = $1 ORDER BY date_created DESC LIMIT 20",
      explanation: 'Summary table of recent orders.',
      chartSpec: {
        type: 'table',
        title: 'Order Summary',
        dataKey: 'total',
        labelKey: 'wc_order_id',
      },
    });
  });

  it('TC-E03: Handles query with very long SQL', async () => {
    const longSql = "SELECT p.name, p.sku, p.price, p.stock_quantity, p.category_name, ROUND(SUM(oi.total), 2) AS revenue, SUM(oi.quantity) AS units_sold FROM products p LEFT JOIN order_items oi ON p.id = oi.product_id AND oi.store_id = $1 LEFT JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 AND o.status IN ('completed', 'processing') WHERE p.store_id = $1 AND p.status = 'publish' GROUP BY p.name, p.sku, p.price, p.stock_quantity, p.category_name ORDER BY revenue DESC LIMIT 50";
    await runTestCase({
      question: 'Show me a detailed product performance report',
      sql: longSql,
      explanation: 'Detailed product report with revenue and units sold.',
      chartSpec: null,
    });
  });

  it('TC-E04: Handles query with subquery', async () => {
    await runTestCase({
      question: 'Products that have never been ordered',
      sql: "SELECT p.name, p.sku, p.price FROM products p WHERE p.store_id = $1 AND p.status = 'publish' AND p.id NOT IN (SELECT DISTINCT oi.product_id FROM order_items oi WHERE oi.store_id = $1 AND oi.product_id IS NOT NULL) ORDER BY p.name ASC LIMIT 50",
      explanation: 'Products with no matching order items.',
      chartSpec: null,
    });
  });

  it('TC-E05: Handles monetary rounding in SQL', async () => {
    await runTestCase({
      question: 'What is the total tax collected?',
      sql: "SELECT COALESCE(ROUND(SUM(tax_total), 2), 0) AS total_tax FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') LIMIT 1",
      explanation: 'Total tax collected from completed and processing orders.',
      chartSpec: null,
    });
  });

  it('TC-E06: Handles query with COALESCE for null safety', async () => {
    await runTestCase({
      question: 'What is my total shipping revenue?',
      sql: "SELECT COALESCE(ROUND(SUM(shipping_total), 2), 0) AS total_shipping FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') LIMIT 1",
      explanation: 'Total shipping revenue from completed/processing orders.',
      chartSpec: null,
    });
  });

  it('TC-E07: Handles query with multiple JOIN tables (all with store_id)', async () => {
    await runTestCase({
      question: 'Revenue by category for this month',
      sql: "SELECT p.category_name, ROUND(SUM(oi.total), 2) AS category_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 WHERE oi.store_id = $1 AND o.status IN ('completed', 'processing') AND o.date_created >= DATE_TRUNC('month', NOW()) AND p.category_name IS NOT NULL GROUP BY p.category_name ORDER BY category_revenue DESC LIMIT 20",
      explanation: 'Revenue by product category for the current month.',
      chartSpec: {
        type: 'pie',
        title: 'Monthly Revenue by Category',
        dataKey: 'category_revenue',
        labelKey: 'category_name',
      },
    });
  });

  it('TC-E08: Handles date range query with specific dates', async () => {
    await runTestCase({
      question: 'Revenue between January and March 2026',
      sql: "SELECT COALESCE(ROUND(SUM(total), 2), 0) AS revenue, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= '2026-01-01' AND date_created < '2026-04-01' LIMIT 1",
      explanation: 'Revenue from January to March 2026.',
      chartSpec: null,
    });
  });

  it('TC-E09: Handles query with FILTER clause for conditional aggregation', async () => {
    await runTestCase({
      question: 'What is the ratio of completed to processing orders?',
      sql: "SELECT COUNT(*) FILTER (WHERE status = 'completed') AS completed_count, COUNT(*) FILTER (WHERE status = 'processing') AS processing_count, COUNT(*) AS total_orders FROM orders WHERE store_id = $1 LIMIT 1",
      explanation: 'Counts completed vs processing orders.',
      chartSpec: null,
    });
  });

  it('TC-E10: Handles doughnut chart for category distribution', async () => {
    await runTestCase({
      question: 'Show product distribution by category',
      sql: "SELECT category_name, COUNT(*) AS product_count FROM products WHERE store_id = $1 AND status = 'publish' AND category_name IS NOT NULL GROUP BY category_name ORDER BY product_count DESC LIMIT 15",
      explanation: 'Product count distribution across categories.',
      chartSpec: {
        type: 'doughnut',
        title: 'Products by Category',
        dataKey: 'product_count',
        labelKey: 'category_name',
      },
    });
  });
});
