# Feature: Customer Queries — New vs Returning, Top Spenders

**Slug:** customer-queries
**Status:** In Progress
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Build a dedicated customer query service that provides pre-built, parameterized SQL queries for common customer metrics.
- These queries run directly against the read-only database (no AI pipeline needed), providing fast, reliable results for dashboard widgets and quick metrics.
- Also enhance the AI system prompt with additional customer-focused few-shot examples.
- Success criteria: Customer service returns accurate new vs returning breakdown, top spenders, customer lifetime value, and acquisition metrics with store_id isolation, proper filtering, and monetary rounding.

## 2. Scope

### In scope
- `customerQueries` module with pre-built customer query functions
- New vs returning customer breakdown (1 order = new, 2+ = returning)
- Top customers by total spending
- Top customers by order count
- New customers by period (today, this week, this month, custom range)
- Customer lifetime value summary (average total_spent, average order_count)
- Additional few-shot examples for customer queries
- Unit tests (mocked Knex) and integration tests

### Out of scope
- Chart rendering from results (task 3.10)
- API route/endpoint for customer dashboard (Sprint 4)
- Order query services (task 3.9)
- Caching of query results (future enhancement)
- Raw PII (emails, names, addresses) — never exposed to external APIs

## 3. User Stories
- As a store owner, I want to see the breakdown of new vs returning customers so I understand my retention.
- As a store owner, I want to see my top customers by spending so I can reward loyal buyers.
- As a store owner, I want to see how many new customers I acquired this month so I can track growth.
- As a store owner, I want to see average customer lifetime value so I can plan marketing spend.

## 4. Requirements

### Functional Requirements
- FR1: New vs returning breakdown: COUNT customers grouped by order_count = 1 (new) vs > 1 (returning), with store_id filter
- FR2: Top spenders: SELECT display_name, total_spent, order_count from customers, ORDER BY total_spent DESC, with store_id filter
- FR3: Top by order count: SELECT display_name, order_count, total_spent from customers, ORDER BY order_count DESC, with store_id filter
- FR4: New customers by period: COUNT customers WHERE first_order_date within period, with store_id filter
- FR5: New customers by custom date range: COUNT customers WHERE first_order_date BETWEEN start and end, with store_id filter
- FR6: Customer lifetime value summary: AVG(total_spent), AVG(order_count), COUNT total customers, with store_id filter
- FR7: All queries MUST include `WHERE store_id = $1` for tenant isolation
- FR8: All queries use parameterized placeholders (no string concatenation)
- FR9: All monetary values MUST be rounded to 2 decimal places
- FR10: Never expose raw customer emails — use display_name only

### Non-functional Requirements
- Performance: All queries < 2 seconds (pre-built SQL, no AI latency)
- Security: store_id tenant isolation, parameterized queries, read-only DB, no PII exposure
- Observability: Structured pino logging with durationMs

## 5. UX / API Contract

### Module API
```typescript
interface CustomerQueryDeps {
  readonlyDb: Knex;
}

interface NewVsReturningResult {
  newCustomers: number;
  returningCustomers: number;
  totalCustomers: number;
}

interface TopCustomerResult {
  displayName: string;
  totalSpent: number;
  orderCount: number;
}

interface NewCustomersResult {
  count: number;
}

interface CustomerLifetimeValueResult {
  avgTotalSpent: number;
  avgOrderCount: number;
  totalCustomers: number;
}

function createCustomerQueries(deps: CustomerQueryDeps) {
  async function newVsReturning(storeId: string): Promise<NewVsReturningResult>;
  async function topCustomersBySpending(storeId: string, limit?: number): Promise<TopCustomerResult[]>;
  async function topCustomersByOrderCount(storeId: string, limit?: number): Promise<TopCustomerResult[]>;
  async function newCustomersByPeriod(storeId: string, period: CustomerPeriod): Promise<NewCustomersResult>;
  async function newCustomersByDateRange(storeId: string, startDate: string, endDate: string): Promise<NewCustomersResult>;
  async function customerLifetimeValue(storeId: string): Promise<CustomerLifetimeValueResult>;
  return { newVsReturning, topCustomersBySpending, topCustomersByOrderCount, newCustomersByPeriod, newCustomersByDateRange, customerLifetimeValue };
}
```

## 6. Data Model Impact
- No new tables or migrations required.
- Reads from: customers table via read-only connection.

## 7. Integration Impact
- Uses `readonlyDb` (Knex instance with `woo_ai_readonly` PostgreSQL user)
- No external API calls.
- Consumed by: Future dashboard API routes (Sprint 4)

## 8. Code Impact

### Files/modules likely to change
- `backend/src/ai/prompts/examples.ts` — add customer-specific few-shot examples

### New files/modules
- `backend/src/ai/customerQueries.ts` — customer query service
- `backend/tests/unit/ai/customerQueries.test.ts` — unit tests
- `backend/tests/integration/customerQueries.test.ts` — integration tests

## 9. Test Plan

### Unit Tests
- newVsReturning returns correct new, returning, total counts
- newVsReturning handles zero customers (returns 0s)
- topCustomersBySpending returns customers sorted by total_spent DESC
- topCustomersBySpending respects limit parameter
- topCustomersBySpending defaults to limit 10
- topCustomersByOrderCount returns customers sorted by order_count DESC
- newCustomersByPeriod counts customers with first_order_date in period
- newCustomersByPeriod validates period parameter
- newCustomersByDateRange validates date inputs
- newCustomersByDateRange validates startDate before endDate
- customerLifetimeValue returns correct averages
- customerLifetimeValue handles zero customers
- All queries include store_id parameter
- Invalid storeId throws ValidationError
- DB errors wrapped as AppError
- Logging verified (start/completion/error)

### Integration Tests
- Executes real SELECT query against readonly DB
- Returns correct customer data for known test data
- Respects parameterized queries with store_id
- Handles empty result sets gracefully
- New vs returning correctly classifies test customers

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
