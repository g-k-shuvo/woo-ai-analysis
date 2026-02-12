# Feature: Scheduled Insights (Daily/Weekly Email)

**Slug:** scheduled-insights
**Status:** In Progress
**Owner:** Backend + Plugin
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Allow store owners to schedule automated daily or weekly insight digest emails
- Insights summarize key metrics: revenue, orders, top products, customer activity
- Reduce friction — owners get proactive analytics without asking questions
- Success metric: Store owners can create/update/delete scheduled insight schedules and the backend stores/manages them

## 2. Scope

### In scope
- Backend: `scheduled_insights` table, CRUD service, REST API routes
- Plugin: AJAX handlers to proxy CRUD operations
- Plugin: React component for managing scheduled insights (create, list, delete)
- Unit + integration tests for backend service and routes
- PHPUnit tests for plugin AJAX handlers

### Out of scope
- Actual email sending (SMTP/SES) — deferred to infrastructure setup
- BullMQ job worker for executing scheduled jobs — deferred to ops setup
- Email template rendering — deferred to future task

## 3. User Stories
- As a store owner, I want to schedule a daily revenue summary so I stay informed without logging in
- As a store owner, I want to choose between daily and weekly schedules
- As a store owner, I want to manage (list, update, delete) my scheduled insights
- As a store owner, I want to see when the last insight was sent and the next scheduled time

## 4. Requirements

### Functional Requirements
- FR1: Create a scheduled insight with name, frequency (daily/weekly), preferred hour (0–23), enabled toggle
- FR2: List all scheduled insights for a store
- FR3: Update a scheduled insight (name, frequency, hour, enabled)
- FR4: Delete a scheduled insight
- FR5: Max 5 scheduled insights per store
- FR6: Track last_run_at and next_run_at timestamps
- FR7: All queries filtered by store_id (tenant isolation)

### Non-functional Requirements
- Performance: API response < 200ms for CRUD operations
- Security: Store data isolation via store_id, nonce verification on WP AJAX
- Reliability: Validation on all inputs, graceful error handling

## 5. UX / API Contract

### Backend API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scheduled-insights` | Create a new scheduled insight |
| GET | `/api/scheduled-insights` | List all scheduled insights for store |
| PUT | `/api/scheduled-insights/:id` | Update a scheduled insight |
| DELETE | `/api/scheduled-insights/:id` | Delete a scheduled insight |

### POST /api/scheduled-insights
Request:
```json
{
  "name": "Daily Revenue Summary",
  "frequency": "daily",
  "hour": 8,
  "enabled": true
}
```
Response (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Daily Revenue Summary",
    "frequency": "daily",
    "hour": 8,
    "enabled": true,
    "lastRunAt": null,
    "nextRunAt": "2026-02-13T08:00:00Z",
    "createdAt": "2026-02-12T10:00:00Z",
    "updatedAt": "2026-02-12T10:00:00Z"
  }
}
```

### Plugin AJAX Endpoints
| Action | Description |
|--------|-------------|
| `waa_create_scheduled_insight` | Proxies to POST /api/scheduled-insights |
| `waa_list_scheduled_insights` | Proxies to GET /api/scheduled-insights |
| `waa_update_scheduled_insight` | Proxies to PUT /api/scheduled-insights/:id |
| `waa_delete_scheduled_insight` | Proxies to DELETE /api/scheduled-insights/:id |

## 6. Data Model Impact

### New table: `scheduled_insights`
```sql
CREATE TABLE scheduled_insights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  frequency     VARCHAR(20) NOT NULL DEFAULT 'daily',  -- daily|weekly
  hour          INTEGER NOT NULL DEFAULT 8,             -- 0–23 UTC
  day_of_week   INTEGER,                                -- 0–6 (Sunday–Saturday), only for weekly
  enabled       BOOLEAN NOT NULL DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_scheduled_insights_store ON scheduled_insights(store_id);
CREATE INDEX idx_scheduled_insights_next_run ON scheduled_insights(next_run_at) WHERE enabled = true;
```

## 7. Integration Impact
- No external API calls needed for CRUD
- Future: BullMQ worker will poll `next_run_at` to trigger insight generation + email

## 8. Code Impact

### New files
- `backend/db/migrations/20260212000014_create_scheduled_insights.ts`
- `backend/src/services/scheduledInsightsService.ts`
- `backend/src/routes/scheduledInsights/index.ts`
- `backend/tests/unit/services/scheduledInsightsService.test.ts`
- `backend/tests/unit/routes/scheduledInsights.test.ts`
- `backend/tests/integration/scheduledInsights.test.ts`
- `plugin/admin/src/components/ScheduledInsights.jsx`
- `plugin/tests/Unit/ScheduledInsightsAjaxTest.php`

### Files to modify
- `backend/src/index.ts` — wire service + routes
- `plugin/includes/class-ajax-handler.php` — add 4 AJAX handlers
- `plugin/admin/src/App.jsx` — add ScheduledInsights page
- `docs/ai/api-endpoints.md` — document new endpoints
- `docs/ai/datamodel.md` — document new table

## 9. Test Plan

### Unit Tests (Backend)
- scheduledInsightsService: CRUD operations, validation, max limit, next_run_at calculation
- Route tests: request/response validation, error handling, auth

### Integration Tests (Backend)
- Full CRUD flow via Fastify inject

### Unit Tests (Plugin)
- AJAX handler: nonce verification, permission checks, input sanitization, proxy behavior

## 10. Rollout Plan
- Feature flag: No
- Migration: New table only, no changes to existing tables
- Backward compatibility: Fully backward-compatible (additive)

## 11. Checklist
- [ ] Plan reviewed
- [ ] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
