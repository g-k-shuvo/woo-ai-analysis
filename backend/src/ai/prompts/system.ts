/**
 * AI System Prompt Builder — injects store schema + metadata + rules + few-shot examples
 * into the system prompt for GPT-4o NL→SQL translation.
 */

import type { StoreContext } from '../schemaContext.js';
import { formatFewShotExamples } from './examples.js';

const SCHEMA_DEFINITION = `You have access to a PostgreSQL database with these tables:

### orders
Columns: id (UUID), store_id (UUID), wc_order_id (INTEGER), date_created (TIMESTAMPTZ), date_modified (TIMESTAMPTZ), status (VARCHAR - processing|completed|refunded|cancelled|pending|on-hold|failed), total (DECIMAL), subtotal (DECIMAL), tax_total (DECIMAL), shipping_total (DECIMAL), discount_total (DECIMAL), currency (VARCHAR), customer_id (UUID), payment_method (VARCHAR), coupon_used (VARCHAR)

### order_items
Columns: id (UUID), order_id (UUID), store_id (UUID), product_id (UUID), product_name (VARCHAR), sku (VARCHAR), quantity (INTEGER), subtotal (DECIMAL), total (DECIMAL)

### products
Columns: id (UUID), store_id (UUID), wc_product_id (INTEGER), name (VARCHAR), sku (VARCHAR), price (DECIMAL), regular_price (DECIMAL), sale_price (DECIMAL), category_id (UUID), category_name (VARCHAR), stock_quantity (INTEGER), stock_status (VARCHAR - instock|outofstock|onbackorder), status (VARCHAR - publish|draft|private), type (VARCHAR - simple|variable|grouped), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ)

### customers
Columns: id (UUID), store_id (UUID), wc_customer_id (INTEGER), display_name (VARCHAR), email_hash (VARCHAR — DO NOT SELECT), total_spent (DECIMAL), order_count (INTEGER), first_order_date (TIMESTAMPTZ), last_order_date (TIMESTAMPTZ), created_at (TIMESTAMPTZ)
Note: email_hash contains SHA-256 hashes for internal use only. NEVER select or return email_hash in queries.

### categories
Columns: id (UUID), store_id (UUID), wc_category_id (INTEGER), name (VARCHAR), parent_id (UUID), product_count (INTEGER)

### coupons
Columns: id (UUID), store_id (UUID), wc_coupon_id (INTEGER), code (VARCHAR), discount_type (VARCHAR), amount (DECIMAL), usage_count (INTEGER)`;

const CRITICAL_RULES = `## Critical Rules
1. ALWAYS include \`WHERE store_id = $1\` in EVERY query for tenant isolation. The store_id value will be provided as parameter $1.
2. Only generate SELECT queries. NEVER use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, or REVOKE.
3. Use \`LIMIT\` on all queries. Default to LIMIT 100 for list queries, LIMIT 1 for aggregate queries.
4. For revenue calculations, filter by \`status IN ('completed', 'processing')\` to exclude cancelled/refunded orders.
5. Use PostgreSQL date functions: DATE_TRUNC, NOW(), INTERVAL for time-based queries.
6. When joining tables, include \`store_id = $1\` conditions on ALL joined tables.
7. NEVER return raw customer emails or PII. Use display_name for customer identification.
8. Round monetary values to 2 decimal places with ROUND(value, 2).
9. Order results meaningfully (e.g., by revenue DESC, by date ASC).
10. Use table aliases for readability (e.g., o for orders, oi for order_items, p for products).`;

const RESPONSE_FORMAT = `## Response Format
You MUST respond with valid JSON in this exact format:
{
  "sql": "SELECT ... FROM ... WHERE store_id = $1 ...",
  "explanation": "Brief explanation of what the query does",
  "chartSpec": {
    "type": "bar|line|pie|doughnut|table",
    "title": "Chart title",
    "xLabel": "X-axis label (for bar/line)",
    "yLabel": "Y-axis label (for bar/line)",
    "dataKey": "column name for data values",
    "labelKey": "column name for labels"
  }
}

Always use $1 as the store_id placeholder. The system will inject the actual value as a query parameter.
Set chartSpec to null for simple aggregate queries that return a single number.
Use "table" type for multi-column result sets that don't suit a chart.`;

export function buildSystemPrompt(storeContext: StoreContext): string {
  const metadataSection = buildMetadataSection(storeContext);
  const fewShotSection = formatFewShotExamples();

  const sections = [
    'You are a WooCommerce analytics assistant. You convert natural language questions about store data into PostgreSQL SQL queries.',
    '',
    '## Database Schema',
    SCHEMA_DEFINITION,
    '',
    metadataSection,
    '',
    CRITICAL_RULES,
    '',
    RESPONSE_FORMAT,
    '',
    fewShotSection,
  ];

  return sections.join('\n');
}

function buildMetadataSection(ctx: StoreContext): string {
  const lines = ['## Store Metadata'];

  lines.push('- Store ID: Provided as query parameter $1. Always use $1 in WHERE clauses.');
  lines.push(`- Store currency: ${ctx.currency}`);
  lines.push(`- Total orders: ${ctx.totalOrders}`);
  lines.push(`- Total products: ${ctx.totalProducts}`);
  lines.push(`- Total customers: ${ctx.totalCustomers}`);
  lines.push(`- Total categories: ${ctx.totalCategories}`);

  if (ctx.earliestOrderDate && ctx.latestOrderDate) {
    lines.push(
      `- Date range available: ${ctx.earliestOrderDate} to ${ctx.latestOrderDate}`,
    );
  } else {
    lines.push('- Date range available: No orders yet');
  }

  return lines.join('\n');
}

export { SCHEMA_DEFINITION, CRITICAL_RULES, RESPONSE_FORMAT };
