# Feature: Save Chart / Pin to Dashboard

**Slug:** save-chart-to-dashboard
**Status:** Done
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Allow store owners to save charts from chat responses to a personal dashboard for quick reference.
- Success criteria: Users can save, list, reorder, update, and delete pinned charts via both the chat UI and a dedicated dashboard view.

## 2. Scope

### In scope
- Backend CRUD API for saved charts (POST, GET, PUT, DELETE)
- Layout reordering endpoint (PUT /api/dashboards/layout)
- Plugin AJAX proxy handlers for dashboard operations
- "Pin to Dashboard" button on chat message charts
- Dashboard view listing all saved charts with delete capability
- Maximum 20 saved charts per store (free plan)

### Out of scope
- Drag-and-drop layout editor (task 6.2)
- PDF/CSV export (tasks 6.3, 6.4)
- Scheduled insights (task 6.5)

## 3. User Stories
- As a store owner, I want to save a chart from a chat answer so that I can revisit it without re-asking the question.
- As a store owner, I want to see all my saved charts on a dashboard page.
- As a store owner, I want to delete saved charts I no longer need.
- As a store owner, I want to reorder my saved charts.

## 4. Requirements

### Functional Requirements
- FR1: POST /api/dashboards/charts — save a chart with title, queryText, chartConfig
- FR2: GET /api/dashboards/charts — list all saved charts for the authenticated store
- FR3: PUT /api/dashboards/charts/:id — update title or chartConfig
- FR4: DELETE /api/dashboards/charts/:id — remove a saved chart
- FR5: PUT /api/dashboards/layout — batch-update position_index values
- FR6: Maximum 20 charts per store (free plan); return 409 if exceeded
- FR7: Plugin AJAX handlers proxy all dashboard operations with nonce verification
- FR8: Chat UI shows "Save to Dashboard" button on assistant messages with charts
- FR9: Dashboard page renders saved charts in position_index order

### Non-functional Requirements
- Performance: List endpoint < 200ms
- Security: Store data isolation (WHERE store_id = ?), nonce verification
- Reliability: Validation on all inputs

## 5. UX / API Contract

### API Endpoints

**POST /api/dashboards/charts**
```json
Request: { "title": "Revenue by Product", "queryText": "Show revenue by product", "chartConfig": { ... } }
Response: { "success": true, "data": { "id": "uuid", "title": "...", "queryText": "...", "chartConfig": { ... }, "positionIndex": 0, "createdAt": "...", "updatedAt": "..." } }
```

**GET /api/dashboards/charts**
```json
Response: { "success": true, "data": { "charts": [ { "id": "...", "title": "...", "queryText": "...", "chartConfig": { ... }, "positionIndex": 0, "createdAt": "...", "updatedAt": "..." } ] } }
```

**PUT /api/dashboards/charts/:id**
```json
Request: { "title": "Updated Title", "chartConfig": { ... } }
Response: { "success": true, "data": { "id": "...", ... } }
```

**DELETE /api/dashboards/charts/:id**
```json
Response: { "success": true, "data": { "deleted": true } }
```

**PUT /api/dashboards/layout**
```json
Request: { "positions": [ { "id": "uuid1", "positionIndex": 0 }, { "id": "uuid2", "positionIndex": 1 } ] }
Response: { "success": true, "data": { "updated": true } }
```

## 6. Data Model Impact
- Uses existing `saved_charts` table (migration 20260211000008 already exists)
- No new migrations needed
- Tenancy: All queries filtered by `store_id`

## 7. Integration Impact
- No WooCommerce hooks/webhooks affected
- No external API calls
- Auth: Existing Bearer token middleware

## 8. Code Impact

### New files/modules
- `backend/src/services/savedChartsService.ts` — CRUD service
- `backend/src/routes/dashboards/charts.ts` — route handlers
- `backend/tests/unit/services/savedChartsService.test.ts`
- `backend/tests/unit/routes/dashboardCharts.test.ts`
- `backend/tests/integration/dashboardCharts.test.ts`
- `plugin/admin/src/components/SaveChartButton.jsx`
- `plugin/admin/src/components/Dashboard.jsx`
- `plugin/admin/src/hooks/useDashboard.js`
- `plugin/tests/Unit/DashboardAjaxTest.php`

### Files likely to change
- `backend/src/index.ts` — register dashboard routes
- `plugin/includes/class-ajax-handler.php` — add dashboard AJAX handlers
- `plugin/admin/src/components/ChatMessage.jsx` — add save button
- `plugin/admin/src/App.jsx` — add dashboard page routing

## 9. Test Plan

### Unit Tests
- savedChartsService: save, list, get, update, delete, reorder, validation, max limit
- dashboardCharts routes: all endpoints, input validation, error handling
- Plugin AjaxHandler: dashboard AJAX handlers

### Integration Tests
- Full CRUD flow through Fastify inject
- Store isolation (chart from store A not visible to store B)
- Position reordering

### Regression Risks
- Chat query flow should not be affected
- Existing AJAX handlers should continue working

## 10. Rollout Plan
- Feature flag: No
- Migration: None (table already exists)
- Backward compatibility: Additive only
- Deployment: Backend first, then plugin update

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [x] Tests added/updated
- [x] Lint/test/build pass
- [x] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
