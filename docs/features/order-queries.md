# Feature: Order Queries — Count, AOV, Status Breakdown

**Slug:** order-queries
**Status:** Complete
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Build a dedicated order query service that provides pre-built, parameterized SQL queries for common order metrics.
- These queries run directly against the read-only database (no AI pipeline needed), providing fast, reliable results for dashboard widgets and quick metrics.
- Also enhance the AI system prompt with additional order-focused few-shot examples.
- Success criteria: Order service returns accurate order count, AOV, status breakdown, orders by period, and orders by date range with store_id isolation, proper filtering, and monetary rounding.

## 2. Scope

### In scope
- `orderQueries` module with pre-built order query functions
- Order count (all-time and by period) for completed/processing orders
- Average order value (AOV)
- Order status breakdown (count per status)
- Orders by period (today, this week, this month, this year, last 7/30 days)
- Orders by custom date range
- Recent orders list (limited, no PII — order-level data only)
- Additional few-shot examples for order queries
- Unit tests (mocked Knex) and integration tests

### Out of scope
- Chart rendering from results (task 3.10)
- API route/endpoint for order dashboard (Sprint 4)
- Revenue query services (task 3.6 — already done)
- Caching of query results (future enhancement)
- Raw PII (emails, addresses) — never exposed to external APIs

## 3. User Stories
- As a store owner, I want to see how many orders I received today/this week/month so I can track volume.
- As a store owner, I want to see my average order value so I can gauge spending patterns.
- As a store owner, I want to see the breakdown of orders by status so I can identify bottlenecks.
- As a store owner, I want to see recent orders so I can monitor incoming activity.

## 4. Requirements

### Functional Requirements
- FR1: Order count: COUNT orders for completed/processing with store_id filter, all-time and by period
- FR2: Average order value: AVG(total) for completed/processing orders with store_id filter
- FR3: Order status breakdown: COUNT(*) GROUP BY status with store_id filter (all statuses)
- FR4: Orders by period: COUNT + SUM(total) + AVG(total) for each period type, with store_id filter
- FR5: Orders by custom date range: COUNT + SUM(total) + AVG(total) for date range, with store_id filter
- FR6: Recent orders: SELECT wc_order_id, date_created, status, total, LIMIT N, with store_id filter
- FR7: All queries MUST include `WHERE store_id = $1` for tenant isolation
- FR8: All queries use parameterized placeholders (no string concatenation)
- FR9: All monetary values MUST be rounded to 2 decimal places
- FR10: Never expose raw customer PII — recent orders use order-level data only

### Non-functional Requirements
- Performance: All queries < 2 seconds (pre-built SQL, no AI latency)
- Security: store_id tenant isolation, parameterized queries, read-only DB, no PII exposure
- Observability: Structured pino logging with durationMs

## 5. UX / API Contract

### Module API
```typescript
interface OrderQueryDeps {
  readonlyDb: Knex;
}

type OrderPeriod = 'today' | 'this_week' | 'this_month' | 'this_year' | 'last_7_days' | 'last_30_days';

interface OrderCountResult {
  orderCount: number;
  revenue: number;
  avgOrderValue: number;
}

interface OrderStatusBreakdownRow {
  status: string;
  count: number;
}

interface RecentOrderRow {
  wcOrderId: number;
  dateCreated: string;
  status: string;
  total: number;
}

function createOrderQueries(deps: OrderQueryDeps) {
  async function orderCount(storeId: string): Promise<OrderCountResult>;
  async function ordersByPeriod(storeId: string, period: OrderPeriod): Promise<OrderCountResult>;
  async function ordersByDateRange(storeId: string, startDate: string, endDate: string): Promise<OrderCountResult>;
  async function orderStatusBreakdown(storeId: string): Promise<OrderStatusBreakdownRow[]>;
  async function recentOrders(storeId: string, limit?: number): Promise<RecentOrderRow[]>;
  return { orderCount, ordersByPeriod, ordersByDateRange, orderStatusBreakdown, recentOrders };
}
```

## 6. Data Model Impact
- No new tables or migrations required.
- Reads from: orders table via read-only connection.

## 7. Integration Impact
- Uses `readonlyDb` (Knex instance with `woo_ai_readonly` PostgreSQL user)
- No external API calls.
- Consumed by: Future dashboard API routes (Sprint 4)

## 8. Code Impact

### Files/modules likely to change
- `backend/src/ai/prompts/examples.ts` — add order-specific few-shot examples

### New files/modules
- `backend/src/ai/orderQueries.ts` — order query service
- `backend/tests/unit/ai/orderQueries.test.ts` — unit tests
- `backend/tests/integration/orderQueries.test.ts` — integration tests

## 9. Test Plan

### Unit Tests
- orderCount returns correct count, revenue, avgOrderValue
- orderCount handles zero orders (returns 0s)
- ordersByPeriod generates correct results for each period type
- ordersByPeriod validates period parameter
- ordersByDateRange validates date inputs
- ordersByDateRange validates startDate before endDate
- orderStatusBreakdown returns all statuses with counts
- orderStatusBreakdown handles empty orders
- recentOrders returns orders sorted by date_created DESC
- recentOrders respects limit parameter
- recentOrders defaults to limit 10
- All queries include store_id parameter
- Invalid storeId throws ValidationError
- DB errors wrapped as AppError
- Logging verified (start/completion/error)

### Integration Tests
- Executes real SELECT query against readonly DB
- Returns correct order data for known test data
- Respects parameterized queries with store_id
- Handles empty result sets gracefully
- Status breakdown correctly counts test orders

### Regression Risks
- None — new module, existing few-shot examples unchanged (only additions)

## 10. Rollout Plan
- No feature flag needed
- No migration
- Backward compatible — additive change only

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [x] Tests added/updated
- [x] Lint/test/build pass
- [x] Docs updated (docs/ai/, agent_docs/)
- [x] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
