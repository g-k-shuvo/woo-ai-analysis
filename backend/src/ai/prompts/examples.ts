/**
 * Few-shot NL→SQL examples for the AI system prompt.
 * These teach GPT-4o the correct SQL patterns for WooCommerce analytics queries.
 *
 * Every example uses $1 as the parameterized store_id placeholder.
 * Every example is SELECT-only and includes a LIMIT where appropriate.
 */

export interface FewShotExample {
  category: 'revenue' | 'product' | 'customer' | 'order';
  question: string;
  sql: string;
  explanation: string;
}

const examples: readonly FewShotExample[] = [
  // ── Revenue ───────────────────────────────────────────────
  {
    category: 'revenue',
    question: 'What is my total revenue?',
    sql: `SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') LIMIT 1`,
    explanation:
      'Sums the total column for completed and processing orders for this store.',
  },
  {
    category: 'revenue',
    question: 'What was my revenue last month?',
    sql: `SELECT SUM(total) AS monthly_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND date_created < DATE_TRUNC('month', NOW()) LIMIT 1`,
    explanation:
      'Sums revenue for the previous calendar month using date_trunc boundaries.',
  },
  {
    category: 'revenue',
    question: 'Show me daily revenue for the last 7 days',
    sql: `SELECT DATE(date_created) AS day, SUM(total) AS daily_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= NOW() - INTERVAL '7 days' GROUP BY DATE(date_created) ORDER BY day ASC LIMIT 7`,
    explanation:
      'Groups revenue by day for the last 7 days, ordered chronologically.',
  },
  {
    category: 'revenue',
    question: 'What is my average order value?',
    sql: `SELECT ROUND(AVG(total), 2) AS avg_order_value FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') LIMIT 1`,
    explanation:
      'Calculates the average total across all completed/processing orders.',
  },
  {
    category: 'revenue',
    question: 'Compare this month revenue to last month',
    sql: `SELECT 'current' AS period, COALESCE(ROUND(SUM(total), 2), 0) AS revenue, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('month', NOW()) AND date_created < NOW() LIMIT 1`,
    explanation:
      'Gets current month revenue. A second query with previous month boundaries provides the comparison.',
  },
  {
    category: 'revenue',
    question: 'Show me monthly revenue for the last 6 months',
    sql: `SELECT DATE_TRUNC('month', date_created) AS month, ROUND(SUM(total), 2) AS monthly_revenue, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= NOW() - INTERVAL '6 months' GROUP BY DATE_TRUNC('month', date_created) ORDER BY month ASC LIMIT 6`,
    explanation:
      'Groups revenue by month for the last 6 months, ordered chronologically.',
  },
  {
    category: 'revenue',
    question: 'What was my revenue this week?',
    sql: `SELECT COALESCE(ROUND(SUM(total), 2), 0) AS weekly_revenue, COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('week', NOW()) LIMIT 1`,
    explanation:
      'Sums revenue from the start of the current week (Monday) to now.',
  },

  // ── Product ───────────────────────────────────────────────
  {
    category: 'product',
    question: 'What are my top 10 selling products?',
    sql: `SELECT p.name, SUM(oi.quantity) AS total_sold, SUM(oi.total) AS total_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 WHERE oi.store_id = $1 AND o.status IN ('completed', 'processing') GROUP BY p.name ORDER BY total_sold DESC LIMIT 10`,
    explanation:
      'Joins order_items with products to get top sellers by quantity.',
  },
  {
    category: 'product',
    question: 'Which product categories generate the most revenue?',
    sql: `SELECT p.category_name, SUM(oi.total) AS category_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 WHERE oi.store_id = $1 AND o.status IN ('completed', 'processing') AND p.category_name IS NOT NULL GROUP BY p.category_name ORDER BY category_revenue DESC LIMIT 20`,
    explanation:
      'Groups order_items revenue by product category for completed orders.',
  },
  {
    category: 'product',
    question: 'How many products do I have in stock?',
    sql: `SELECT COUNT(*) AS in_stock_count FROM products WHERE store_id = $1 AND stock_status = 'instock' AND status = 'publish' LIMIT 1`,
    explanation: 'Counts published products with instock status.',
  },
  {
    category: 'product',
    question: 'What are my top 5 products by revenue?',
    sql: `SELECT p.name, ROUND(SUM(oi.total), 2) AS total_revenue, SUM(oi.quantity) AS total_sold FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 WHERE oi.store_id = $1 AND o.status IN ('completed', 'processing') GROUP BY p.name ORDER BY total_revenue DESC LIMIT 5`,
    explanation:
      'Joins order_items with products to get top sellers by revenue.',
  },
  {
    category: 'product',
    question: 'Which products are low on stock?',
    sql: `SELECT name, sku, stock_quantity, COALESCE(price, 0) AS price FROM products WHERE store_id = $1 AND stock_status = 'instock' AND status = 'publish' AND stock_quantity IS NOT NULL AND stock_quantity <= 5 ORDER BY stock_quantity ASC LIMIT 20`,
    explanation:
      'Lists published products with stock at or below 5 units, sorted by lowest first.',
  },
  {
    category: 'product',
    question: 'Which products are out of stock?',
    sql: `SELECT name, sku, COALESCE(price, 0) AS price FROM products WHERE store_id = $1 AND stock_status = 'outofstock' AND status = 'publish' ORDER BY name ASC LIMIT 50`,
    explanation:
      'Lists all published products currently marked as out of stock.',
  },
  {
    category: 'product',
    question: 'What were my best selling products last month?',
    sql: `SELECT p.name, SUM(oi.quantity) AS total_sold, ROUND(SUM(oi.total), 2) AS total_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 JOIN orders o ON oi.order_id = o.id AND o.store_id = $1 WHERE oi.store_id = $1 AND o.status IN ('completed', 'processing') AND o.date_created >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND o.date_created < DATE_TRUNC('month', NOW()) GROUP BY p.name ORDER BY total_sold DESC LIMIT 10`,
    explanation:
      'Joins order_items with products for orders in the previous calendar month.',
  },

  // ── Customer ──────────────────────────────────────────────
  {
    category: 'customer',
    question: 'How many new vs returning customers do I have?',
    sql: `SELECT CASE WHEN order_count = 1 THEN 'New' ELSE 'Returning' END AS customer_type, COUNT(*) AS customer_count FROM customers WHERE store_id = $1 AND order_count > 0 GROUP BY customer_type LIMIT 2`,
    explanation:
      'Classifies customers as New (1 order) or Returning (2+ orders).',
  },
  {
    category: 'customer',
    question: 'Who are my top 10 customers by spending?',
    sql: `SELECT display_name, total_spent, order_count FROM customers WHERE store_id = $1 AND order_count > 0 ORDER BY total_spent DESC LIMIT 10`,
    explanation:
      'Lists customers ordered by total_spent descending. Uses display_name (not email) to avoid PII.',
  },
  {
    category: 'customer',
    question: 'How many customers placed their first order this month?',
    sql: `SELECT COUNT(*) AS new_customers FROM customers WHERE store_id = $1 AND first_order_date >= DATE_TRUNC('month', NOW()) LIMIT 1`,
    explanation:
      'Counts customers whose first_order_date is in the current month.',
  },
  {
    category: 'customer',
    question: 'Who are my most frequent buyers?',
    sql: `SELECT display_name, order_count, ROUND(total_spent, 2) AS total_spent FROM customers WHERE store_id = $1 AND order_count > 0 ORDER BY order_count DESC LIMIT 10`,
    explanation:
      'Lists customers ordered by order_count descending. Uses display_name to avoid PII.',
  },
  {
    category: 'customer',
    question: 'What is my average customer lifetime value?',
    sql: `SELECT ROUND(AVG(total_spent), 2) AS avg_lifetime_value, ROUND(AVG(order_count), 2) AS avg_orders, COUNT(*) AS total_customers FROM customers WHERE store_id = $1 AND order_count > 0 LIMIT 1`,
    explanation:
      'Calculates average total_spent and order_count across all customers with at least one order.',
  },
  {
    category: 'customer',
    question: 'How many new customers did I get last week?',
    sql: `SELECT COUNT(*) AS new_customers FROM customers WHERE store_id = $1 AND first_order_date >= DATE_TRUNC('week', NOW()) - INTERVAL '1 week' AND first_order_date < DATE_TRUNC('week', NOW()) LIMIT 1`,
    explanation:
      'Counts customers whose first_order_date was in the previous calendar week.',
  },
  {
    category: 'customer',
    question: 'How many total customers do I have?',
    sql: `SELECT COUNT(*) AS total_customers FROM customers WHERE store_id = $1 AND order_count > 0 LIMIT 1`,
    explanation:
      'Counts all customers with at least one order for this store.',
  },

  // ── Order ─────────────────────────────────────────────────
  {
    category: 'order',
    question: 'How many orders did I get today?',
    sql: `SELECT COUNT(*) AS order_count FROM orders WHERE store_id = $1 AND date_created >= DATE_TRUNC('day', NOW()) LIMIT 1`,
    explanation: 'Counts orders created since the start of today (UTC).',
  },
  {
    category: 'order',
    question: 'What is the breakdown of orders by status?',
    sql: `SELECT status, COUNT(*) AS order_count FROM orders WHERE store_id = $1 GROUP BY status ORDER BY order_count DESC LIMIT 100`,
    explanation: 'Groups all orders by status for this store.',
  },
  {
    category: 'order',
    question: 'Which payment methods are most popular?',
    sql: `SELECT payment_method, COUNT(*) AS usage_count FROM orders WHERE store_id = $1 AND payment_method IS NOT NULL GROUP BY payment_method ORDER BY usage_count DESC LIMIT 10`,
    explanation:
      'Counts orders by payment method, excluding nulls.',
  },
  {
    category: 'order',
    question: 'How many orders did I get this month?',
    sql: `SELECT COUNT(*) AS order_count, COALESCE(ROUND(SUM(total), 2), 0) AS total_revenue FROM orders WHERE store_id = $1 AND status IN ('completed', 'processing') AND date_created >= DATE_TRUNC('month', NOW()) LIMIT 1`,
    explanation:
      'Counts completed/processing orders from the start of the current month.',
  },
  {
    category: 'order',
    question: 'Show me my recent orders',
    sql: `SELECT wc_order_id, date_created, status, ROUND(total, 2) AS total FROM orders WHERE store_id = $1 ORDER BY date_created DESC LIMIT 10`,
    explanation:
      'Lists the 10 most recent orders sorted by creation date descending.',
  },
  {
    category: 'order',
    question: 'How many orders are pending?',
    sql: `SELECT COUNT(*) AS pending_count FROM orders WHERE store_id = $1 AND status = 'pending' LIMIT 1`,
    explanation:
      'Counts orders with pending status for this store.',
  },
  {
    category: 'order',
    question: 'What percentage of orders were refunded?',
    sql: `SELECT ROUND(COUNT(*) FILTER (WHERE status = 'refunded') * 100.0 / NULLIF(COUNT(*), 0), 2) AS refund_rate, COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_count, COUNT(*) AS total_orders FROM orders WHERE store_id = $1 LIMIT 1`,
    explanation:
      'Calculates refund rate as percentage of total orders for this store.',
  },
];

export function getFewShotExamples(): readonly FewShotExample[] {
  return examples;
}

export function formatFewShotExamples(): string {
  const lines: string[] = ['## Example Questions and SQL'];

  for (const ex of examples) {
    lines.push('');
    lines.push(`Q: "${ex.question}"`);
    lines.push(`SQL: ${ex.sql}`);
    lines.push(`Explanation: ${ex.explanation}`);
  }

  return lines.join('\n');
}
