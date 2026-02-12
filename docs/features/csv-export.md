# Feature: CSV Export

**Slug:** csv-export
**Status:** In Progress
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Allow store owners to export saved dashboard chart data as CSV files for use in spreadsheets, data analysis, or sharing.
- Success criteria: Users can generate a CSV from any saved chart or from all dashboard charts combined, downloadable via both the SaaS API and WP admin.

## 2. Scope

### In scope
- Backend service to generate CSV from saved chart data
- REST API endpoints: POST /api/exports/csv (single or all charts)
- Plugin AJAX proxy handler for CSV export
- "Export CSV" button on the Dashboard component
- CSV includes headers row + data rows from chart datasets

### Out of scope
- Scheduled CSV exports (task 6.5)
- Custom column ordering / field selection
- Stored CSV history (unlike PDF reports, CSV is generated on-demand, not stored)

## 3. User Stories
- As a store owner, I want to export my dashboard chart data as CSV so I can import it into Excel or Google Sheets.
- As a store owner, I want to export all dashboard charts into a single CSV with chart titles as section headers.
- As a store owner, I want to export a single chart's data as CSV.

## 4. Requirements

### Functional Requirements
- FR1: POST /api/exports/csv — generates CSV from saved charts. Body: `{ chartId?: string }`. If chartId provided, exports single chart; otherwise exports all charts.
- FR2: CSV format: UTF-8 with BOM for Excel compatibility, comma-separated, quoted strings
- FR3: For multi-chart export, each chart section separated by a blank line and prefixed with chart title row
- FR4: Returns CSV as `text/csv` with `Content-Disposition: attachment; filename="export-<timestamp>.csv"`
- FR5: Plugin AJAX handler proxies export with nonce verification
- FR6: Dashboard UI shows "Export CSV" button alongside existing "Export PDF" button

### Non-functional Requirements
- Performance: CSV generation < 2 seconds for 20 charts
- Security: Store data isolation (WHERE store_id = ?), nonce verification
- Reliability: Graceful handling when no charts are saved

## 5. UX / API Contract

### API Endpoints

**POST /api/exports/csv**
```json
Request: { "chartId": "optional-uuid" }
Response: text/csv binary stream with Content-Disposition: attachment; filename="export-2026-02-12.csv"
```

**Error Response:**
```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "No saved charts to export." } }
```

## 6. Data Model Impact
- No new tables required (uses existing saved_charts table)
- No migrations needed

## 7. Integration Impact
- No WooCommerce hooks/webhooks affected
- Uses existing savedChartsService for chart data retrieval
- Auth: Existing Bearer token middleware

## 8. Code Impact

### New files/modules
- `backend/src/services/csvExportService.ts` — CSV generation service
- `backend/src/routes/exports/csv.ts` — CSV export route handler
- `backend/tests/unit/services/csvExportService.test.ts`
- `backend/tests/unit/routes/csvExport.test.ts`
- `backend/tests/integration/csvExport.test.ts`
- `plugin/tests/Unit/CsvExportAjaxTest.php`
- `plugin/admin/src/components/ExportCsvButton.jsx`

### Files likely to change
- `backend/src/index.ts` — register CSV export routes
- `plugin/includes/class-ajax-handler.php` — add CSV AJAX handler
- `plugin/admin/src/components/Dashboard.jsx` — add CSV export button
- `docs/ai/api-endpoints.md` — document new endpoint
- `docs/ai/codestructure.md` — add new files

## 9. Test Plan

### Unit Tests
- csvExportService: generateCsv (all charts, single chart, empty charts, validation, BOM, escaping)
- CSV export route: endpoint, input validation, error handling, content-type headers
- Plugin AjaxHandler: CSV AJAX handler (export, nonce, permissions, errors)

### Integration Tests
- Full export flow through Fastify inject
- Store isolation (charts from store A not visible to store B)
- Empty dashboard handling
- Single chart export

### Regression Risks
- Dashboard chart operations should not be affected
- Existing AJAX handlers should continue working

## 10. Rollout Plan
- Feature flag: No
- Migration: None needed
- Backward compatibility: Additive only
- Deployment: Backend first, then plugin update

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
