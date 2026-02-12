# Feature: Custom Dashboard with Drag-and-Drop Layout

**Slug:** custom-dashboard-layout
**Status:** In Progress
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Allow store owners to customize their dashboard layout by dragging, dropping, and resizing chart widgets on a grid.
- Success criteria: Users can rearrange and resize saved charts in a responsive grid, and the layout persists across sessions.

## 2. Scope

### In scope
- Add grid layout columns to saved_charts table (grid_x, grid_y, grid_w, grid_h)
- Backend service for saving/retrieving grid layout per chart
- PUT /api/dashboards/grid-layout endpoint for batch grid position updates
- Plugin AJAX handler for grid layout operations
- DashboardGrid React component with drag-and-drop + resize
- Responsive grid (12-column) with minimum widget sizes

### Out of scope
- PDF/CSV export (tasks 6.3, 6.4)
- Scheduled insights (task 6.5)
- Custom chart creation (outside of chat)
- Dashboard sharing between users

## 3. User Stories
- As a store owner, I want to drag charts to rearrange them on my dashboard so I can organize my most important metrics.
- As a store owner, I want to resize charts so I can make important charts larger and less important ones smaller.
- As a store owner, I want my dashboard layout to persist so I see the same arrangement next time I visit.

## 4. Requirements

### Functional Requirements
- FR1: New DB migration adds grid_x, grid_y, grid_w, grid_h columns to saved_charts
- FR2: PUT /api/dashboards/grid-layout — batch update grid positions for all charts
- FR3: GET /api/dashboards/charts returns grid layout fields (gridX, gridY, gridW, gridH)
- FR4: Default new charts to gridW=6, gridH=4 (half-width, reasonable height)
- FR5: Plugin AJAX handler waa_update_grid_layout proxies to backend
- FR6: DashboardGrid component renders charts in a CSS grid with drag-and-drop
- FR7: Charts can be resized (min 3x2, max 12x8)
- FR8: Layout changes auto-save after drag/resize completes

### Non-functional Requirements
- Performance: Grid layout update < 200ms
- Security: Store data isolation (WHERE store_id = ?), nonce verification
- Reliability: Graceful fallback if grid positions are null (use position_index ordering)

## 5. UX / API Contract

### API Endpoints

**PUT /api/dashboards/grid-layout**
```json
Request: {
  "items": [
    { "id": "uuid1", "gridX": 0, "gridY": 0, "gridW": 6, "gridH": 4 },
    { "id": "uuid2", "gridX": 6, "gridY": 0, "gridW": 6, "gridH": 4 }
  ]
}
Response: { "success": true, "data": { "updated": true } }
```

**GET /api/dashboards/charts** (updated response)
```json
Response: {
  "success": true,
  "data": {
    "charts": [
      {
        "id": "...", "title": "...", "queryText": "...",
        "chartConfig": { ... },
        "positionIndex": 0,
        "gridX": 0, "gridY": 0, "gridW": 6, "gridH": 4,
        "createdAt": "...", "updatedAt": "..."
      }
    ]
  }
}
```

## 6. Data Model Impact
- ALTER TABLE saved_charts ADD COLUMN grid_x INTEGER DEFAULT 0
- ALTER TABLE saved_charts ADD COLUMN grid_y INTEGER DEFAULT 0
- ALTER TABLE saved_charts ADD COLUMN grid_w INTEGER DEFAULT 6
- ALTER TABLE saved_charts ADD COLUMN grid_h INTEGER DEFAULT 4
- New migration file needed
- Tenancy: All queries filtered by store_id

## 7. Integration Impact
- No WooCommerce hooks/webhooks affected
- No external API calls
- Auth: Existing Bearer token middleware

## 8. Code Impact

### New files/modules
- `backend/src/migrations/20260212000009_add_grid_layout_to_saved_charts.ts` — migration
- `backend/src/services/dashboardLayoutService.ts` — grid layout service
- `backend/src/routes/dashboards/layout.ts` — grid layout route
- `backend/tests/unit/services/dashboardLayoutService.test.ts`
- `backend/tests/unit/routes/dashboardLayout.test.ts`
- `backend/tests/integration/dashboardLayout.test.ts`
- `plugin/admin/src/components/DashboardGrid.jsx` — drag-and-drop grid
- `plugin/tests/Unit/DashboardLayoutAjaxTest.php`

### Files likely to change
- `backend/src/services/savedChartsService.ts` — add grid fields to response
- `backend/src/routes/dashboards/charts.ts` — no change (grid fields come from service)
- `backend/src/index.ts` — register grid layout route
- `plugin/includes/class-ajax-handler.php` — add grid layout AJAX handler
- `plugin/admin/src/components/Dashboard.jsx` — integrate DashboardGrid
- `plugin/admin/src/hooks/useDashboard.js` — add updateGridLayout function

## 9. Test Plan

### Unit Tests
- dashboardLayoutService: updateGridLayout, validation, store isolation
- dashboardLayout route: endpoint, schema validation, error handling
- savedChartsService: grid fields in response
- Plugin AjaxHandler: grid layout AJAX handler

### Integration Tests
- Full grid layout flow through Fastify inject
- Store isolation for grid layout updates
- Default grid values for new charts
- Grid layout persistence and retrieval

### Regression Risks
- Existing dashboard functionality (list, save, delete) should not be affected
- Charts without grid positions should still render (fallback to position_index)

## 10. Rollout Plan
- Feature flag: No
- Migration: New migration for grid columns with defaults
- Backward compatibility: Grid fields are nullable with defaults; old charts still work
- Deployment: Backend first (migration + API), then plugin update

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
