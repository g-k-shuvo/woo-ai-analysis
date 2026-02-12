# Feature: Predictive Analytics — Revenue Forecast

**Slug:** predictive-analytics
**Status:** In Progress
**Owner:** Backend + Plugin
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Let store owners see projected revenue forecasts (7, 14, 30 days ahead) based on historical order data.
- Uses linear regression on daily revenue aggregates to project future revenue.
- No external AI calls — purely server-side statistical computation on synced data.

## 2. Scope

### In scope
- Backend forecast service: queries historical daily revenue, computes linear regression, returns forecast data points
- Revenue forecast API endpoints (generate, get, delete)
- DB table `revenue_forecasts` to cache computed forecasts
- Plugin AJAX handlers to proxy forecast requests
- React component to display forecast chart
- Unit + integration tests for all layers

### Out of scope
- Advanced ML models (ARIMA, Prophet, neural networks)
- Product-level or category-level forecasting
- Real-time streaming updates
- Confidence intervals (future enhancement)

## 3. User Stories
- As a store owner, I want to generate a revenue forecast so I can plan inventory and marketing spend.
- As a store owner, I want to see a chart showing actual vs. forecasted revenue.
- As a store owner, I want to choose the forecast horizon (7, 14, or 30 days).

## 4. Requirements

### Functional Requirements
- FR1: Generate forecast — compute linear regression on last 90 days of daily revenue, project forward by `daysAhead` (7/14/30).
- FR2: Store forecast — persist forecast data points in `revenue_forecasts` table for quick retrieval.
- FR3: List forecasts — return all forecasts for a store, ordered by creation date.
- FR4: Delete forecast — remove a specific forecast.
- FR5: Max 10 forecasts per store.
- FR6: Forecast data includes: date, predicted revenue, actual revenue (for historical days).
- FR7: Requires at least 7 days of order history to generate a forecast.

### Non-functional Requirements
- Performance: Forecast generation < 3 seconds
- Security: All queries include `store_id` for tenant isolation
- Reliability: Graceful error if insufficient data
- Observability: Logging on forecast generation

## 5. UX / API Contract

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/forecasts` | Generate a new revenue forecast. Body: `{ daysAhead: 7|14|30 }` |
| GET | `/api/forecasts` | List all forecasts for the store |
| GET | `/api/forecasts/:id` | Get a specific forecast with data points |
| DELETE | `/api/forecasts/:id` | Delete a forecast |

### Example Response (POST /api/forecasts)
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "daysAhead": 30,
    "generatedAt": "2026-02-12T10:00:00.000Z",
    "historicalDays": 90,
    "dataPoints": [
      { "date": "2026-02-13", "predicted": 1250.50, "type": "forecast" },
      { "date": "2026-02-14", "predicted": 1275.00, "type": "forecast" }
    ],
    "summary": {
      "avgDailyRevenue": 1200.00,
      "projectedTotal": 37500.00,
      "trend": "up"
    },
    "createdAt": "2026-02-12T10:00:00.000Z"
  }
}
```

### Plugin AJAX Actions
| Action | Description |
|--------|-------------|
| `waa_generate_forecast` | Proxies to POST /api/forecasts |
| `waa_list_forecasts` | Proxies to GET /api/forecasts |
| `waa_get_forecast` | Proxies to GET /api/forecasts/:id |
| `waa_delete_forecast` | Proxies to DELETE /api/forecasts/:id |

## 6. Data Model Impact

### New table: `revenue_forecasts`
```sql
CREATE TABLE revenue_forecasts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  days_ahead      INTEGER NOT NULL,
  historical_days INTEGER NOT NULL DEFAULT 90,
  data_points     JSONB NOT NULL DEFAULT '[]',
  summary         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_revenue_forecasts_store ON revenue_forecasts(store_id);
```

## 7. Integration Impact
- No external API calls — all computation is server-side
- Reads from `orders` table (synced WooCommerce data)
- Uses read-only DB connection for historical revenue query

## 8. Code Impact

### New files
- `backend/db/migrations/20260212000015_create_revenue_forecasts.ts`
- `backend/src/services/revenueForecastService.ts`
- `backend/src/routes/forecasts/index.ts`
- `backend/tests/unit/services/revenueForecastService.test.ts`
- `backend/tests/unit/routes/forecasts.test.ts`
- `backend/tests/integration/forecasts.test.ts`
- `plugin/admin/src/components/RevenueForecast.jsx`
- `plugin/tests/Unit/RevenueForecastAjaxTest.php`

### Modified files
- `backend/src/index.ts` — register forecast service + routes
- `plugin/includes/class-ajax-handler.php` — add 4 AJAX handlers
- `docs/ai/api-endpoints.md` — add forecast endpoints
- `docs/ai/datamodel.md` — add revenue_forecasts table

## 9. Test Plan

### Unit Tests
- revenueForecastService: generate, list, get, delete, validation, store isolation, max limit
- forecast routes: schema validation, status codes, error handling

### Integration Tests
- Full CRUD flow with in-memory DB
- Store isolation verification
- Insufficient data handling

### Plugin PHPUnit Tests
- Action registration, nonce verification, permission checks
- Input validation, API proxying, response sanitization

## 10. Rollout Plan
- Feature flag: No (standard deployment)
- Migration: New table, no backfill needed
- Backward compatibility: No breaking changes

## 11. Checklist
- [ ] Plan reviewed
- [ ] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
