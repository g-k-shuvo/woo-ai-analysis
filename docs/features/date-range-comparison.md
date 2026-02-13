# Feature: Date Range Comparison (Task 6.7)

## Objective
Allow store owners to compare metrics between two date ranges (e.g., this month vs last month, this week vs last week, custom ranges). Provides revenue, order count, AOV, and product/customer breakdowns with trend indicators.

## Scope

### In Scope
- Preset period comparisons: today, this_week, this_month, this_year, last_7_days, last_30_days
- Custom date range comparison (arbitrary start/end dates for both periods)
- Metrics: revenue, order count, average order value, top products, top customers
- Percentage change + trend direction for each metric
- Daily breakdown of revenue for both periods
- Backend REST API: `POST /api/comparisons` (generate), `GET /api/comparisons` (list), `GET /api/comparisons/:id` (detail), `DELETE /api/comparisons/:id`
- Plugin AJAX handlers: `waa_generate_comparison`, `waa_list_comparisons`, `waa_get_comparison`, `waa_delete_comparison`
- React component: `DateRangeComparison` with preset selectors and custom date pickers
- Persist comparison results in DB for reference

### Out of Scope
- Real-time live comparison (comparisons are snapshot-based)
- Comparisons across different stores

## Data Model

### date_range_comparisons table
```sql
CREATE TABLE date_range_comparisons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  preset          VARCHAR(20),
  current_start   TIMESTAMPTZ NOT NULL,
  current_end     TIMESTAMPTZ NOT NULL,
  previous_start  TIMESTAMPTZ NOT NULL,
  previous_end    TIMESTAMPTZ NOT NULL,
  metrics         JSONB NOT NULL DEFAULT '{}',
  breakdown       JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_date_range_comparisons_store ON date_range_comparisons(store_id);
```

### metrics JSONB shape
```json
{
  "current": { "revenue": 12500.00, "orderCount": 150, "avgOrderValue": 83.33 },
  "previous": { "revenue": 10200.00, "orderCount": 120, "avgOrderValue": 85.00 },
  "revenueChange": 2300.00,
  "revenueChangePercent": 22.55,
  "orderCountChange": 30,
  "orderCountChangePercent": 25.0,
  "aovChange": -1.67,
  "aovChangePercent": -1.96,
  "trend": "up"
}
```

### breakdown JSONB shape
```json
[
  { "date": "2026-02-01", "currentRevenue": 450.00, "previousRevenue": 380.00 },
  ...
]
```

## API Endpoints

### POST /api/comparisons
Generate a new date range comparison.
- Body (preset): `{ "preset": "this_month" }`
- Body (custom): `{ "currentStart": "2026-01-01", "currentEnd": "2026-01-31", "previousStart": "2025-12-01", "previousEnd": "2025-12-31" }`
- Returns 201 with comparison data

### GET /api/comparisons
List saved comparisons for the store.
- Returns `{ comparisons: [...] }`

### GET /api/comparisons/:id
Get a specific comparison with full breakdown.

### DELETE /api/comparisons/:id
Delete a comparison.

## Test Plan
- Unit tests: dateComparisonService (preset + custom periods, validation, edge cases)
- Unit tests: comparison routes (schema validation, error handling)
- Integration tests: full flow (generate, list, get, delete)
- Plugin tests: AJAX handler (nonce, permissions, proxy, sanitization)
- Target: 90%+ coverage
