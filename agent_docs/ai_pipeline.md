# AI Query Pipeline — Deep Reference

## Pipeline Architecture

```
User Question
    ↓
[1] Schema Context Injection
    ↓
[2] NL → SQL Translation (OpenAI GPT-4o)
    ↓
[3] SQL Validation & Sandboxing
    ↓
[4] Execute Query (read-only PostgreSQL user)
    ↓
[5] Chart Specification Generation
    ↓
[6] Natural Language Response Assembly
    ↓
{ text, chart, data, sql }
```

## Step 1: Schema Context Injection

Before every AI call, inject the store's data schema into the system prompt:

```
You have access to a PostgreSQL database with these tables:

- orders (id, store_id, wc_order_id, date_created, status, total, currency, customer_id, payment_method, coupon_used)
- order_items (id, order_id, store_id, product_id, product_name, quantity, subtotal, total)
- products (id, store_id, wc_product_id, name, sku, price, category_name, stock_quantity, status)
- customers (id, store_id, display_name, total_spent, order_count, first_order_date, last_order_date)
- categories (id, store_id, name, product_count)
- coupons (id, store_id, code, discount_type, amount, usage_count)

Date range available: [earliest_order_date] to [latest_order_date]
Store currency: [currency]
Total orders: [count]
Total products: [count]

CRITICAL RULES:
- Always include WHERE store_id = '[store_id]' in every query
- Only generate SELECT queries (never INSERT, UPDATE, DELETE, DROP, ALTER)
- Use LIMIT 100 for list queries
- Use date functions for time-based queries (e.g., date_created >= NOW() - INTERVAL '30 days')
```

## Step 2: NL → SQL Translation

System prompt instructs GPT-4o to return structured JSON:

```json
{
  "sql": "SELECT p.name, SUM(oi.total) as revenue FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.store_id = $1 AND oi.order_id IN (SELECT id FROM orders WHERE date_created >= NOW() - INTERVAL '30 days') GROUP BY p.name ORDER BY revenue DESC LIMIT 10",
  "params": ["store_id_value"],
  "explanation": "Top 10 products by revenue in the last 30 days",
  "chartSpec": {
    "type": "bar",
    "title": "Top Products by Revenue (Last 30 Days)",
    "xLabel": "Product",
    "yLabel": "Revenue ($)",
    "dataKey": "revenue",
    "labelKey": "name"
  }
}
```

### Few-Shot Examples (Critical for Accuracy)
Include 10-15 example question→SQL pairs in the system prompt. Examples:

| Question | SQL Pattern |
|----------|-------------|
| "What's my total revenue?" | `SELECT SUM(total) FROM orders WHERE store_id = $1 AND status = 'completed'` |
| "Top selling products this month" | `SELECT p.name, SUM(oi.quantity) FROM order_items oi JOIN products...` |
| "New vs returning customers" | `SELECT CASE WHEN order_count = 1 THEN 'New' ELSE 'Returning' END...` |
| "Revenue by day this week" | `SELECT DATE(date_created), SUM(total) ... GROUP BY DATE(date_created)` |
| "Average order value" | `SELECT AVG(total) FROM orders WHERE store_id = $1 AND status = 'completed'` |

## Step 3: SQL Validation

**MANDATORY** — never skip this step.

```typescript
function validateSql(sql: string, storeId: string): boolean {
  const upper = sql.toUpperCase().trim();
  
  // Must be SELECT
  if (!upper.startsWith('SELECT')) return false;
  
  // Must NOT contain dangerous keywords
  const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE'];
  for (const keyword of forbidden) {
    if (upper.includes(keyword)) return false;
  }
  
  // Must reference store_id
  if (!sql.includes('store_id')) return false;
  
  // Must have LIMIT
  if (!upper.includes('LIMIT')) {
    sql += ' LIMIT 100';
  }
  
  return true;
}
```

Additional safeguards:
- Execute on a **read-only PostgreSQL user** (only has SELECT permission)
- Set **statement_timeout = 5000** (5 seconds)
- Rate limit: 50 queries per store per hour (Pro), 10 per day (Free)

## Step 4: Query Execution

```typescript
// Use a dedicated read-only connection pool
const readOnlyPool = new Pool({
  connectionString: process.env.DATABASE_READONLY_URL,
  statement_timeout: 5000,  // 5 second timeout
  max: 10,                  // connection pool size
});

const result = await readOnlyPool.query(validatedSql, params);
```

## Step 5: Chart Specification

The AI returns a `chartSpec` object. Map it to Chart.js config:

```typescript
function toChartConfig(spec: ChartSpec, data: any[]): ChartConfiguration {
  return {
    type: spec.type,  // 'bar' | 'line' | 'pie' | 'doughnut'
    data: {
      labels: data.map(row => row[spec.labelKey]),
      datasets: [{
        label: spec.title,
        data: data.map(row => row[spec.dataKey]),
        backgroundColor: generateColors(data.length),
      }]
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: spec.title } },
      scales: spec.type !== 'pie' ? {
        x: { title: { display: true, text: spec.xLabel } },
        y: { title: { display: true, text: spec.yLabel } }
      } : undefined
    }
  };
}
```

## Step 6: Response Assembly

Final response sent to the plugin:

```json
{
  "answer": "Your top-selling product this month is 'Premium Widget' with $4,250 in revenue, followed by...",
  "chart": {
    "png": "base64_encoded_chart_image",
    "config": { /* Chart.js config for interactive client rendering */ }
  },
  "data": [
    { "name": "Premium Widget", "revenue": 4250.00 },
    { "name": "Basic Widget", "revenue": 2100.00 }
  ],
  "sql": "SELECT ... (for debugging, only shown in dev mode)",
  "conversationId": "uuid"
}
```

## Testing

Test file: `backend/tests/ai-test-cases.json`

Each test case:
```json
{
  "id": "revenue-total",
  "question": "What is my total revenue?",
  "variations": [
    "How much revenue did I make?",
    "Total sales amount",
    "What are my earnings?"
  ],
  "expectedSqlContains": ["SELECT", "SUM(total)", "orders", "store_id"],
  "expectedSqlMustNot": ["DELETE", "UPDATE", "INSERT"],
  "expectedChartType": null,
  "category": "revenue"
}
```

Run AI accuracy tests: `cd backend && npm run test:ai`
