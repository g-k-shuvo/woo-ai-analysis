# Feature: Chart Spec Generation

**Slug:** chart-spec-generation
**Status:** In Progress
**Owner:** AI Pipeline
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Convert AI-generated `ChartSpec` + query result rows into a full Chart.js configuration object
- Enable both server-side PNG rendering and client-side interactive chart display
- Acceptance criteria: given a ChartSpec and data rows, produce a valid Chart.js config for bar, line, pie, doughnut, or a structured table representation

## 2. Scope

### In scope
- `toChartConfig()` function: ChartSpec + rows → Chart.js ChartConfiguration
- Support for 5 chart types: bar, line, pie, doughnut, table
- Color palette generation for datasets
- Validation: dataKey/labelKey must exist in result rows
- Edge cases: null chartSpec, empty rows, missing keys, single-row results
- Type exports: ChartConfiguration, TableResult, ChartSpecResult
- Unit tests (90%+ coverage)
- Integration tests (chartSpec + real query result shapes)

### Out of scope
- Server-side PNG rendering (task 4.5)
- Client-side Chart.js integration (task 4.4)
- Chart interactivity (tooltips, click handlers)
- Multiple datasets per chart
- Custom color themes

## 3. User Stories
- As a store owner, I want AI-generated query results to automatically include chart configuration so that the frontend can render visual charts
- As a developer, I want a pure function that converts ChartSpec + data into Chart.js config so that it's testable and reusable

## 4. Requirements

### Functional Requirements
- FR1: Accept ChartSpec (from AIQueryResult) + QueryExecutionResult rows → return ChartConfiguration
- FR2: Return null when chartSpec is null (simple aggregates with no chart)
- FR3: Return null when rows are empty (nothing to chart)
- FR4: Validate dataKey and labelKey exist in result rows; return null with warning if not
- FR5: For `table` type, return a TableResult with headers + rows (not a Chart.js config)
- FR6: For `pie`/`doughnut`, omit axis scales and include legend
- FR7: For `bar`/`line`, include x/y axis labels from chartSpec
- FR8: Generate a consistent color palette with enough colors for the data points
- FR9: Coerce numeric string values to numbers for the data array

### Non-functional Requirements
- Performance: Pure synchronous function, no I/O
- Security: No external API calls, no PII handling
- Reliability: Graceful null returns on invalid input (never throws)
- Observability: Warn-level logging on validation failures

## 5. UX / API Contract

### Module API
```typescript
// Pure function — no deps needed
function toChartConfig(
  spec: ChartSpec | null,
  rows: Record<string, unknown>[]
): ChartSpecResult | null;
```

### Return types
```typescript
interface ChartConfiguration {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor: string[];
      borderColor?: string[];
      borderWidth?: number;
    }>;
  };
  options: {
    responsive: boolean;
    plugins: {
      title: { display: boolean; text: string };
      legend?: { display: boolean; position: string };
    };
    scales?: {
      x: { title: { display: boolean; text: string } };
      y: { title: { display: boolean; text: string } };
    };
  };
}

interface TableResult {
  type: 'table';
  title: string;
  headers: string[];
  rows: unknown[][];
}

type ChartSpecResult = ChartConfiguration | TableResult;
```

## 6. Data Model Impact
- No database changes
- No migrations needed
- No new tables

## 7. Integration Impact
- WooCommerce hooks/webhooks affected: None
- External APIs: None
- Auth method used: N/A (pure function)

## 8. Code Impact

### Files/modules likely to change
- `backend/src/ai/types.ts` — add ChartConfiguration, TableResult, ChartSpecResult types

### New files/modules
- `backend/src/ai/chartSpec.ts` — main module
- `backend/tests/unit/ai/chartSpec.test.ts` — unit tests
- `backend/tests/integration/chartSpec.test.ts` — integration tests

## 9. Test Plan

### Unit Tests
- toChartConfig returns null when chartSpec is null
- toChartConfig returns null when rows are empty
- toChartConfig returns null when dataKey not found in rows
- toChartConfig returns null when labelKey not found in rows
- Bar chart: produces correct Chart.js config with labels, data, colors, axes
- Line chart: produces correct config with borderColor, no fill
- Pie chart: produces correct config without scales, with legend
- Doughnut chart: produces correct config without scales, with legend
- Table type: produces TableResult with headers and row arrays
- Numeric coercion: string numbers converted to actual numbers
- Color generation: produces correct number of colors
- Single row data handling
- Large dataset handling (100+ rows)
- Mixed null/undefined values in data rows

### Integration Tests
- ChartSpec from pipeline + QueryExecutionResult from executor → valid chart config
- Revenue query shape → bar chart config
- Product query shape → pie chart config
- Time series query shape → line chart config
- Aggregation (single row) → null chart spec
- Table query shape → table result

### Regression Risks
- None — new module, no existing behavior changed

## 10. Rollout Plan
- Feature flag: No
- Migration strategy: N/A
- Backward compatibility: N/A (new module)
- Deployment notes: No additional dependencies needed

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
