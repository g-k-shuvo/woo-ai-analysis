# Feature: Chart.js Integration — Client-Side Interactive Charts

**Slug:** chartjs-integration
**Status:** In Progress
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Render interactive Chart.js charts and data tables in the chat UI when the AI response includes a `chartConfig`.
- Store owners see visual bar, line, pie, and doughnut charts inline in the chat thread.
- Table-type responses render as styled HTML tables.
- Success metric: When the backend returns a `chartConfig`, the chat displays an interactive chart or data table below the text answer.

## 2. Scope

### In scope
- ChartRenderer React component — creates a `<canvas>` and renders Chart.js chart from `ChartConfiguration`
- TableRenderer React component — renders an HTML `<table>` from `TableResult`
- Update ChatWindow to conditionally render ChartRenderer or TableRenderer based on `msg.data.chartConfig`
- CSS styling for charts and tables within the chat message thread
- Chart.js lifecycle management (create, update, destroy on unmount)

### Out of scope
- Server-side chart rendering / PNG export (task 4.5)
- Chart type selection UI (task 4.6)
- Chart export/download/save (Phase 2)
- Custom chart theming beyond the existing color palette
- Frontend JS unit tests (no Jest setup in plugin — @wordpress/scripts doesn't include test runner)

## 3. User Stories
- As a store owner, I want to see a bar chart when I ask about revenue by product so that I can visually compare performance.
- As a store owner, I want to see a pie chart when I ask about category distribution so that I can see proportions.
- As a store owner, I want to see a data table for detailed breakdowns so that I can read exact values.
- As a store owner, I want charts to be responsive so they look good on different screen sizes.

## 4. Requirements

### Functional Requirements
- FR1: ChartRenderer accepts a ChartConfiguration object and renders it on a `<canvas>` element using Chart.js
- FR2: ChartRenderer cleans up (destroys) the Chart.js instance on unmount to prevent memory leaks
- FR3: TableRenderer accepts a TableResult object and renders a styled HTML `<table>` with headers and rows
- FR4: ChatWindow renders ChartRenderer when `msg.data.chartConfig.type` is `bar|line|pie|doughnut`
- FR5: ChatWindow renders TableRenderer when `msg.data.chartConfig.type` is `table`
- FR6: When `msg.data.chartConfig` is null, only the text answer is shown (no chart)
- FR7: Charts are responsive and contained within the chat message bubble

### Non-functional Requirements
- Performance: Chart.js renders within 100ms for typical datasets (< 100 data points)
- Security: No external data loading — chart config comes from sanitized backend response
- Reliability: Graceful handling of malformed chart configs (log error, don't crash)
- Accessibility: Tables use proper semantic HTML (`<thead>`, `<th>`, `<tbody>`)

## 5. UX / API Contract

### Data Flow
```
msg.data.chartConfig (from useChat hook)
  ├── null → no chart rendered
  ├── { type: 'bar'|'line'|'pie'|'doughnut', data, options } → <ChartRenderer config={...} />
  └── { type: 'table', title, headers, rows } → <TableRenderer config={...} />
```

### No API changes
- Backend already sends `chartConfig` in the chat response
- AJAX handler already passes it through
- useChat hook already stores it in `msg.data`

## 6. Data Model Impact
- No database changes
- No migrations needed

## 7. Integration Impact
- WooCommerce hooks/webhooks: None
- External APIs: None
- Auth: N/A (client-side rendering of existing data)

## 8. Code Impact

### Files/modules likely to change
- `plugin/admin/src/components/ChatWindow.jsx` — import and render ChartRenderer/TableRenderer

### New files/modules
- `plugin/admin/src/components/ChartRenderer.jsx` — Chart.js canvas component
- `plugin/admin/src/components/TableRenderer.jsx` — HTML table component
- `plugin/admin/src/components/ChartRenderer.css` — chart container styles
- `plugin/admin/src/components/TableRenderer.css` — table styles

## 9. Test Plan

### Unit Tests
- Backend chatService tests already verify chartConfig is included in response (existing)
- Backend chartSpec tests already verify Chart.js config shape (existing)

### Integration Tests
- Manual verification: ask chart-producing questions and verify rendering
- Verify chart cleanup on unmount (clear chat)
- Verify table rendering with various column counts

### Regression Risks
- Existing ChatWindow message rendering must not break
- Existing useChat hook behavior must not change
- Plugin build must still produce valid assets/js/admin.js

## 10. Rollout Plan
- No feature flag needed
- No migration needed
- Backward compatible (adds chart rendering for data that was already being sent)

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [x] Tests added/updated
- [x] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
