# Feature: PDF Report Export

**Slug:** pdf-report-export
**Status:** In Progress
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Allow store owners to export their dashboard charts as a PDF report for offline viewing, printing, or sharing.
- Success criteria: Users can generate a PDF containing all saved dashboard charts with titles, rendered chart images, and a timestamp header. The PDF is downloadable via both the SaaS API and WP admin.

## 2. Scope

### In scope
- Backend service to generate PDF from saved dashboard charts
- Database table to track generated reports (id, store_id, title, status, file_path, created_at)
- REST API endpoints: POST /api/reports/generate, GET /api/reports, GET /api/reports/:id/download
- Plugin AJAX proxy handlers for PDF generation and download
- "Export PDF" button on the Dashboard component
- Report list view to see past reports and re-download

### Out of scope
- CSV export (task 6.4)
- Scheduled report generation (task 6.5)
- Custom report templates / branding
- Email delivery of reports

## 3. User Stories
- As a store owner, I want to export my dashboard as a PDF so I can share it with my team offline.
- As a store owner, I want to see a list of previously generated reports so I can re-download them.
- As a store owner, I want the PDF to include all my saved charts with their titles.

## 4. Requirements

### Functional Requirements
- FR1: POST /api/reports/generate — creates a new report record, renders all saved charts to PNG, assembles into a PDF buffer, stores as base64 in DB, returns report metadata
- FR2: GET /api/reports — lists all reports for the authenticated store (most recent first)
- FR3: GET /api/reports/:id/download — returns the PDF file as application/pdf with Content-Disposition: attachment
- FR4: Maximum 10 stored reports per store; oldest auto-deleted when exceeded
- FR5: Report includes: header with store URL + generation date, each chart as a titled section with PNG image
- FR6: Plugin AJAX handlers proxy report operations with nonce verification
- FR7: Dashboard UI shows "Export PDF" button and report list

### Non-functional Requirements
- Performance: PDF generation < 10 seconds for 20 charts
- Security: Store data isolation (WHERE store_id = ?), nonce verification
- Reliability: Graceful handling when no charts are saved

## 5. UX / API Contract

### API Endpoints

**POST /api/reports/generate**
```json
Request: { "title": "My Dashboard Report" }
Response: { "success": true, "data": { "id": "uuid", "title": "...", "status": "completed", "chartCount": 5, "createdAt": "..." } }
```

**GET /api/reports**
```json
Response: { "success": true, "data": { "reports": [ { "id": "...", "title": "...", "status": "completed", "chartCount": 5, "createdAt": "..." } ] } }
```

**GET /api/reports/:id/download**
```
Response: application/pdf binary stream with Content-Disposition: attachment; filename="report-<id>.pdf"
```

## 6. Data Model Impact
- New table: `reports`
  ```sql
  CREATE TABLE reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id     UUID NOT NULL REFERENCES stores(id),
    title        VARCHAR(255) NOT NULL,
    status       VARCHAR(20) DEFAULT 'pending',
    chart_count  INTEGER DEFAULT 0,
    file_data    TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE INDEX idx_reports_store ON reports(store_id);
  ```
- New migration: 20260212000013_create_reports.ts
- Tenancy: All queries filtered by store_id

## 7. Integration Impact
- No WooCommerce hooks/webhooks affected
- Uses existing chartRenderer (chartjs-node-canvas) for chart PNG rendering
- Uses PDFKit for PDF assembly (new dependency)
- Auth: Existing Bearer token middleware

## 8. Code Impact

### New files/modules
- `backend/db/migrations/20260212000013_create_reports.ts` — migration
- `backend/src/services/pdfReportService.ts` — PDF generation service
- `backend/src/routes/reports/index.ts` — report route handlers
- `backend/tests/unit/services/pdfReportService.test.ts`
- `backend/tests/unit/routes/reports.test.ts`
- `backend/tests/integration/reports.test.ts`
- `plugin/tests/Unit/ReportAjaxTest.php`
- `plugin/admin/src/components/ExportPdfButton.jsx`

### Files likely to change
- `backend/src/index.ts` — register report routes + pdfReportService
- `backend/package.json` — add pdfkit dependency
- `plugin/includes/class-ajax-handler.php` — add report AJAX handlers
- `plugin/admin/src/components/Dashboard.jsx` — add export button
- `docs/ai/api-endpoints.md` — document new endpoints
- `docs/ai/codestructure.md` — add new files

## 9. Test Plan

### Unit Tests
- pdfReportService: generate, list, get, download, max limit cleanup, validation, error handling
- report routes: all endpoints, input validation, error handling, content-type headers
- Plugin AjaxHandler: report AJAX handlers (generate, list, download)

### Integration Tests
- Full generate → list → download flow through Fastify inject
- Store isolation (report from store A not visible to store B)
- Empty dashboard handling

### Regression Risks
- Dashboard chart operations should not be affected
- Existing AJAX handlers should continue working

## 10. Rollout Plan
- Feature flag: No
- Migration: New table (additive)
- Backward compatibility: Additive only
- Deployment: Backend first (run migration), then plugin update

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
