# Feature: Chart Types — Bar, Line, Pie, Doughnut, Table View

**Slug:** chart-types
**Status:** In Progress
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Allow users to switch between chart types (bar, line, pie, doughnut, table) for the same query results without re-querying
- The AI suggests a default chart type; users can override it via a toolbar above the chart
- Backend provides a pure function to convert between chart types; frontend provides a type-selector UI
- Success metric: Users can toggle between all 5 visualization modes for any chart response

## 2. Scope

### In scope
- Backend `convertChartType()` pure function — takes existing ChartSpecResult + rows + target type → new ChartSpecResult
- Frontend ChartTypeSelector component — toolbar with bar/line/pie/doughnut/table buttons
- ChatWindow integration — renders ChartTypeSelector above ChartRenderer/TableRenderer
- Re-rendering server-side chart images on type switch (via new API endpoint)
- CSS styling for the type selector toolbar
- Unit tests for backend convertChartType (90%+ coverage)
- Integration tests for the conversion pipeline

### Out of scope
- Changing the AI's default chart type selection logic (task 3.10)
- Custom chart themes or color palettes
- Chart export/download/save (Phase 2)
- Multiple datasets per chart
- Chart animation customization

## 3. User Stories
- As a store owner, I want to switch a bar chart to a line chart so I can see trends differently
- As a store owner, I want to view any chart as a table to see exact values
- As a store owner, I want to switch between pie and doughnut for proportion data
- As a store owner, I want the chart type selector to remember my choice for each message

## 4. Requirements

### Functional Requirements
- FR1: `convertChartType(config, rows, targetType)` accepts a ChartSpecResult, the original rows, and a target type → returns new ChartSpecResult
- FR2: Converting to 'table' extracts all columns from rows into a TableResult
- FR3: Converting from 'table' to chart type uses the original config's dataKey/labelKey (stored in the response)
- FR4: Converting between chart types preserves labels, data, and title
- FR5: Converting bar↔line preserves scales; converting to pie/doughnut removes scales and adds legend
- FR6: ChartTypeSelector shows 5 buttons (bar, line, pie, doughnut, table) with the active type highlighted
- FR7: Clicking a chart type button triggers local re-render (no server round-trip for client-side charts)
- FR8: The chartSpec summary in ChatResponse already includes dataKey/labelKey for frontend-driven conversion

### Non-functional Requirements
- Performance: Type switching is instant (pure client-side re-render, no API call)
- Security: No external data loading, no PII handling
- Reliability: Invalid conversions fall back to original config
- Accessibility: Toolbar buttons have aria-labels and keyboard navigation

## 5. UX / API Contract

### Backend API
```typescript
// Pure function — no I/O
function convertChartType(
  currentConfig: ChartSpecResult,
  rows: Record<string, unknown>[],
  targetType: 'bar' | 'line' | 'pie' | 'doughnut' | 'table',
  meta: { title: string; dataKey: string; labelKey: string; xLabel?: string; yLabel?: string }
): ChartSpecResult;
```

### ChatResponse changes
```typescript
interface ChatResponse {
  // existing fields...
  chartSpec: ChatSpecSummary | null; // Already includes type, title
  chartConfig: ChartSpecResult | null;
  chartImage: string | null;
  // NEW — metadata for frontend chart type switching
  chartMeta: ChartMeta | null;
}

interface ChartMeta {
  dataKey: string;
  labelKey: string;
  xLabel?: string;
  yLabel?: string;
}
```

### Frontend Component
```jsx
<ChartTypeSelector
  activeType="bar"
  onTypeChange={(type) => handleTypeChange(type)}
/>
```

## 6. Data Model Impact
- No database changes
- No migrations needed

## 7. Integration Impact
- WooCommerce hooks/webhooks: None
- External APIs: None
- Auth: N/A (pure client-side rendering + pure backend function)

## 8. Code Impact

### Files/modules likely to change
- `backend/src/ai/types.ts` — add ChartMeta interface
- `backend/src/services/chatService.ts` — include chartMeta in ChatResponse
- `plugin/admin/src/components/ChatWindow.jsx` — integrate ChartTypeSelector, handle type switching

### New files/modules
- `backend/src/ai/chartTypeConverter.ts` — convertChartType function
- `backend/tests/unit/ai/chartTypeConverter.test.ts` — unit tests
- `backend/tests/integration/chartTypeConverter.test.ts` — integration tests
- `plugin/admin/src/components/ChartTypeSelector.jsx` — chart type toolbar
- `plugin/admin/src/components/ChartTypeSelector.css` — toolbar styles

## 9. Test Plan

### Unit Tests
- convertChartType: bar → line preserves labels, data, scales
- convertChartType: bar → pie removes scales, adds legend
- convertChartType: bar → doughnut removes scales, adds legend
- convertChartType: bar → table returns TableResult with all columns
- convertChartType: line → bar preserves everything
- convertChartType: pie → bar adds scales, removes legend
- convertChartType: pie → line adds scales, removes legend
- convertChartType: table → bar creates ChartConfiguration from rows + meta
- convertChartType: table → pie creates ChartConfiguration from rows + meta
- convertChartType: same type → returns identical config
- convertChartType: handles empty rows gracefully
- convertChartType: handles null/undefined values in data
- convertChartType: preserves title across all conversions
- convertChartType: generates correct colors for target type
- chatService includes chartMeta in response when chartSpec is present
- chatService sets chartMeta to null when no chartSpec

### Integration Tests
- Full pipeline: bar chart → convert to all other types → validate each
- Revenue query result → bar → line → pie → table → back to bar
- Product query result → pie → table → bar
- Table result → convert to chart types with correct data

### Regression Risks
- Existing chartSpec/chartConfig generation must not change
- Existing chatService response shape gains optional field (backward compatible)
- Existing ChartRenderer/TableRenderer behavior unchanged

## 10. Rollout Plan
- No feature flag needed
- No migration needed
- Backward compatible (adds new optional `chartMeta` field to response)

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
