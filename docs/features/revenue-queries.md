# Feature: Revenue Queries — Total, by Period, Comparisons

**Slug:** revenue-queries
**Status:** In Progress
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Build a dedicated revenue query service that provides pre-built, parameterized SQL queries for common revenue metrics.
- These queries run directly against the read-only database (no AI pipeline needed), providing fast, reliable results for dashboard widgets and quick metrics.
- Also enhance the AI system prompt with additional revenue-focused few-shot examples for period comparisons.
- Success criteria: Revenue service returns accurate total, periodic, and comparison metrics with store_id isolation, proper status filtering, and monetary rounding.

## 2. Scope

### In scope
- `revenueQueries` module with pre-built revenue query functions
- Total revenue (all-time, filtered by completed/processing)
- Revenue by period (today, this week, this month, this year, custom range)
- Revenue comparisons (this period vs last period, with growth percentage)
- Revenue by day/week/month breakdown for charting
- Additional few-shot examples for period comparison queries
- Unit tests (mocked Knex) and integration tests

### Out of scope
- Chart rendering from results (task 3.10)
- API route/endpoint for revenue dashboard (Sprint 4)
- Product/customer/order query services (tasks 3.7–3.9)
- Caching of query results (future enhancement)

## 3. User Stories
- As a store owner, I want to see my total revenue so I know my overall earnings.
- As a store owner, I want to see revenue by period (today, this week, this month) for quick insights.
- As a store owner, I want to compare this month's revenue to last month's so I can track growth.
- As a store owner, I want to see daily revenue breakdowns so I can identify trends.

## 4. Requirements

### Functional Requirements
- FR1: Total revenue: SUM(total) for completed/processing orders with store_id filter
- FR2: Revenue by period: today, this_week, this_month, this_year, last_30_days, last_7_days, custom date range
- FR3: Period comparison: current period vs previous period with absolute difference and growth percentage
- FR4: Revenue breakdown: daily, weekly, or monthly grouped revenue for charting
- FR5: All queries MUST include `WHERE store_id = $1` for tenant isolation
- FR6: All queries MUST filter by `status IN ('completed', 'processing')`
- FR7: All monetary values MUST be rounded to 2 decimal places
- FR8: All queries use parameterized placeholders (no string concatenation)

### Non-functional Requirements
- Performance: All queries < 2 seconds (pre-built SQL, no AI latency)
- Security: store_id tenant isolation, parameterized queries, read-only DB
- Observability: Structured pino logging with durationMs

## 5. UX / API Contract

### Module API
```typescript
interface RevenueQueryDeps {
  readonlyDb: Knex;
}

type RevenuePeriod = 'today' | 'this_week' | 'this_month' | 'this_year' | 'last_7_days' | 'last_30_days';
type BreakdownInterval = 'day' | 'week' | 'month';

function createRevenueQueries(deps: RevenueQueryDeps) {
  async function totalRevenue(storeId: string): Promise<RevenueResult>;
  async function revenueByPeriod(storeId: string, period: RevenuePeriod): Promise<RevenueResult>;
  async function revenueByDateRange(storeId: string, startDate: string, endDate: string): Promise<RevenueResult>;
  async function revenueComparison(storeId: string, period: RevenuePeriod): Promise<RevenueComparisonResult>;
  async function revenueBreakdown(storeId: string, interval: BreakdownInterval, periods: number): Promise<RevenueBreakdownResult>;
  return { totalRevenue, revenueByPeriod, revenueByDateRange, revenueComparison, revenueBreakdown };
}
```

### Return types
```typescript
interface RevenueResult {
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
}

interface RevenueComparisonResult {
  current: RevenueResult;
  previous: RevenueResult;
  revenueChange: number;       // absolute difference
  revenueChangePercent: number; // percentage change (0 if previous is 0)
  trend: 'up' | 'down' | 'flat';
}

interface RevenueBreakdownRow {
  period: string;    // ISO date or period label
  revenue: number;
  orderCount: number;
}

interface RevenueBreakdownResult {
  rows: RevenueBreakdownRow[];
  total: number;
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
- `backend/src/ai/prompts/examples.ts` — add revenue comparison few-shot examples

### New files/modules
- `backend/src/ai/revenueQueries.ts` — revenue query service
- `backend/tests/unit/ai/revenueQueries.test.ts` — unit tests
- `backend/tests/integration/revenueQueries.test.ts` — integration tests

## 9. Test Plan

### Unit Tests
- totalRevenue returns correct revenue, orderCount, avgOrderValue
- totalRevenue handles zero orders (returns 0s)
- revenueByPeriod generates correct date boundaries for each period type
- revenueByDateRange validates date inputs
- revenueComparison calculates correct change and percentage
- revenueComparison handles zero previous revenue (avoid division by zero)
- revenueComparison returns correct trend (up/down/flat)
- revenueBreakdown returns rows grouped by day/week/month
- All queries include store_id parameter
- Invalid storeId throws ValidationError
- DB errors wrapped as AppError

### Integration Tests
- Executes real SELECT query against readonly DB
- Returns correct row data for known test data
- Respects parameterized queries with store_id
- Handles empty result sets gracefully

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
