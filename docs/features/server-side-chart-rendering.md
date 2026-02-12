# Feature: Server-Side Chart Rendering — chartjs-node-canvas → PNG

**Slug:** server-side-chart-rendering
**Status:** In Progress
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Render Chart.js charts to PNG images on the server using chartjs-node-canvas.
- Enables chart images in emails, PDF exports, and fallback for clients without JS.
- The chat API response includes a base64-encoded PNG `chartImage` alongside the interactive `chartConfig`.
- Success metric: When a chat response has a chartConfig (non-table), a PNG image is generated and returned as a base64 data URI.

## 2. Scope

### In scope
- chartRenderer service: accepts a ChartConfiguration, renders to PNG buffer via chartjs-node-canvas
- Configurable dimensions (width/height) with sensible defaults (800×400)
- Base64 data URI output for embedding in responses
- Integration with chatService: add `chartImage` field to ChatResponse
- Unit tests for chartRenderer (mocking chartjs-node-canvas)
- Integration tests for the rendering pipeline

### Out of scope
- Dedicated chart rendering API route (not needed yet — inline in chat response)
- Chart image caching / CDN storage (Phase 2)
- PDF export using rendered charts (task 6.3)
- Custom themes or fonts for server-rendered charts

## 3. User Stories
- As a store owner, I want chart images included in responses so they can be displayed without client-side Chart.js.
- As the system, I want server-rendered chart PNGs so they can be embedded in email reports and PDF exports in the future.

## 4. Requirements

### Functional Requirements
- FR1: chartRenderer accepts a ChartConfiguration and returns a PNG Buffer
- FR2: chartRenderer uses configurable width (default 800) and height (default 400)
- FR3: chartRenderer returns null for table-type configs (no image for tables)
- FR4: chatService includes `chartImage` (base64 data URI string or null) in ChatResponse
- FR5: chartImage is only generated when chartConfig is a non-table ChartConfiguration

### Non-functional Requirements
- Performance: Chart rendering completes within 2 seconds for typical datasets
- Security: No external data loading — only processes sanitized ChartConfiguration objects
- Reliability: Graceful error handling — rendering failures return null (don't crash the chat response)
- Memory: Canvas instances are properly cleaned up after rendering

## 5. UX / API Contract

### ChatResponse changes
```typescript
interface ChatResponse {
  answer: string;
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  chartSpec: ChatSpecSummary | null;
  chartConfig: ChartSpecResult | null;
  chartImage: string | null; // NEW — base64 data URI (e.g., "data:image/png;base64,...")
}
```

### No new API routes
- chartImage is included inline in the existing POST /api/chat/query response

## 6. Data Model Impact
- No database changes
- No migrations needed

## 7. Integration Impact
- WooCommerce hooks/webhooks: None
- External APIs: None
- Auth: N/A (server-side rendering of already-generated chart configs)
- New npm dependency: `chartjs-node-canvas` + `chart.js` (peer dependency)

## 8. Code Impact

### New files/modules
- `backend/src/services/chartRenderer.ts` — Server-side PNG rendering service
- `backend/tests/unit/services/chartRenderer.test.ts` — Unit tests
- `backend/tests/integration/chartRenderer.test.ts` — Integration tests

### Files/modules likely to change
- `backend/src/ai/types.ts` — Add ChartRenderOptions interface
- `backend/src/services/chatService.ts` — Add chartImage to ChatResponse, call chartRenderer
- `backend/package.json` — Add chart.js + chartjs-node-canvas dependencies

## 9. Test Plan

### Unit Tests
- chartRenderer returns PNG buffer for bar chart config
- chartRenderer returns PNG buffer for line chart config
- chartRenderer returns PNG buffer for pie chart config
- chartRenderer returns PNG buffer for doughnut chart config
- chartRenderer returns null for null config
- chartRenderer respects custom width/height
- chartRenderer handles rendering errors gracefully (returns null)
- chatService includes chartImage when chart config is present
- chatService sets chartImage to null when no chart config
- chatService sets chartImage to null when chart config is table type

### Integration Tests
- Full pipeline: question → AI → SQL → chart → PNG buffer is valid PNG
- chartRenderer produces valid PNG data URI format
- chatService response includes all expected fields including chartImage

### Regression Risks
- Existing chatService behavior must not break
- Chart config generation is unchanged
- Chat route response shape adds new optional field (backward compatible)

## 10. Rollout Plan
- No feature flag needed
- No migration needed
- Backward compatible (adds new `chartImage` field, existing fields unchanged)
- New npm dependencies: `chart.js@^4`, `chartjs-node-canvas@^4`

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
