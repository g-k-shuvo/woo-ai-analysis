# Feature: Product Queries — Top Sellers, Category Performance

**Slug:** product-queries
**Status:** In Progress
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Build a dedicated product query service that provides pre-built, parameterized SQL queries for common product metrics.
- These queries run directly against the read-only database (no AI pipeline needed), providing fast, reliable results for dashboard widgets and quick metrics.
- Also enhance the AI system prompt with additional product-focused few-shot examples.
- Success criteria: Product service returns accurate top sellers, category performance, stock metrics, and product revenue data with store_id isolation, proper status filtering, and monetary rounding.

## 2. Scope

### In scope
- `productQueries` module with pre-built product query functions
- Top-selling products by quantity and by revenue
- Category performance (revenue, quantity sold, product count per category)
- Low-stock / out-of-stock product alerts
- Product revenue for a specific period
- Additional few-shot examples for product queries
- Unit tests (mocked Knex) and integration tests

### Out of scope
- Chart rendering from results (task 3.10)
- API route/endpoint for product dashboard (Sprint 4)
- Customer/order query services (tasks 3.8–3.9)
- Caching of query results (future enhancement)

## 3. User Stories
- As a store owner, I want to see my top-selling products so I know what's driving sales.
- As a store owner, I want to see which categories generate the most revenue so I can optimize my catalog.
- As a store owner, I want to see which products are low on stock so I can reorder before they run out.
- As a store owner, I want to see product sales for a specific time period so I can track trends.

## 4. Requirements

### Functional Requirements
- FR1: Top sellers by quantity: JOIN order_items with products, SUM(quantity), filter by completed/processing orders with store_id filter
- FR2: Top sellers by revenue: JOIN order_items with products, SUM(order_items.total), filter by completed/processing orders with store_id filter
- FR3: Category performance: GROUP BY category_name, SUM revenue, SUM quantity, COUNT distinct products
- FR4: Low stock alerts: products WHERE stock_quantity <= threshold AND stock_status = 'instock'
- FR5: Out-of-stock products: products WHERE stock_status = 'outofstock'
- FR6: Product sales by period: top sellers filtered by date range
- FR7: All queries MUST include `WHERE store_id = $1` for tenant isolation
- FR8: All queries filter completed/processing orders where applicable
- FR9: All monetary values MUST be rounded to 2 decimal places
- FR10: All queries use parameterized placeholders (no string concatenation)

### Non-functional Requirements
- Performance: All queries < 2 seconds (pre-built SQL, no AI latency)
- Security: store_id tenant isolation, parameterized queries, read-only DB
- Observability: Structured pino logging with durationMs

## 5. UX / API Contract

### Module API
```typescript
interface ProductQueryDeps {
  readonlyDb: Knex;
}

interface TopSellerResult {
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

interface CategoryPerformanceResult {
  categoryName: string;
  totalRevenue: number;
  totalQuantitySold: number;
  productCount: number;
}

interface LowStockProduct {
  productName: string;
  sku: string | null;
  stockQuantity: number;
  stockStatus: string;
  price: number;
}

interface ProductSalesByPeriodResult {
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

function createProductQueries(deps: ProductQueryDeps) {
  async function topSellersByQuantity(storeId: string, limit?: number): Promise<TopSellerResult[]>;
  async function topSellersByRevenue(storeId: string, limit?: number): Promise<TopSellerResult[]>;
  async function categoryPerformance(storeId: string): Promise<CategoryPerformanceResult[]>;
  async function lowStockProducts(storeId: string, threshold?: number): Promise<LowStockProduct[]>;
  async function outOfStockProducts(storeId: string): Promise<LowStockProduct[]>;
  async function productSalesByPeriod(storeId: string, startDate: string, endDate: string, limit?: number): Promise<ProductSalesByPeriodResult[]>;
  return { topSellersByQuantity, topSellersByRevenue, categoryPerformance, lowStockProducts, outOfStockProducts, productSalesByPeriod };
}
```

## 6. Data Model Impact
- No new tables or migrations required.
- Reads from: orders, order_items, products tables via read-only connection.

## 7. Integration Impact
- Uses `readonlyDb` (Knex instance with `woo_ai_readonly` PostgreSQL user)
- No external API calls.
- Consumed by: Future dashboard API routes (Sprint 4)

## 8. Code Impact

### Files/modules likely to change
- `backend/src/ai/prompts/examples.ts` — add product-specific few-shot examples

### New files/modules
- `backend/src/ai/productQueries.ts` — product query service
- `backend/tests/unit/ai/productQueries.test.ts` — unit tests
- `backend/tests/integration/productQueries.test.ts` — integration tests

## 9. Test Plan

### Unit Tests
- topSellersByQuantity returns products sorted by quantity DESC
- topSellersByQuantity respects limit parameter
- topSellersByQuantity defaults to limit 10
- topSellersByRevenue returns products sorted by revenue DESC
- categoryPerformance returns categories with revenue, quantity, product count
- categoryPerformance handles no categories gracefully
- lowStockProducts returns products with stock <= threshold
- lowStockProducts defaults threshold to 5
- outOfStockProducts returns products with outofstock status
- productSalesByPeriod filters by date range
- productSalesByPeriod validates date inputs
- All queries include store_id parameter
- Invalid storeId throws ValidationError
- DB errors wrapped as AppError
- Logging verified (start/completion/error)

### Integration Tests
- Executes real SELECT query against readonly DB
- Returns correct product data for known test data
- Respects parameterized queries with store_id
- Handles empty result sets gracefully
- Category performance aggregates correctly

### Regression Risks
- None — new module, existing few-shot examples unchanged (only additions)

## 10. Rollout Plan
- No feature flag needed
- No migration
- Backward compatible — additive change only

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
