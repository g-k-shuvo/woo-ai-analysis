# Feature: NL→SQL Pipeline — Question → OpenAI → SQL → Validation

**Slug:** nl-to-sql-pipeline
**Status:** In Progress
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Build the NL→SQL pipeline that takes a natural language question, sends it to OpenAI GPT-4o with the store's system prompt, extracts the generated SQL, and validates it before execution.
- Covers task-tracker items 3.2 (NL→SQL pipeline) and 3.3 (SQL validator).
- Success criteria: Pipeline correctly converts questions to validated SQL via OpenAI, rejects dangerous SQL, enforces store_id isolation, and appends LIMIT when missing.

## 2. Scope

### In scope
- SQL validator module (SELECT-only, store_id check, LIMIT enforcement, forbidden keyword detection)
- NL→SQL pipeline module (OpenAI API call, JSON response parsing, validation)
- Pipeline types/interfaces (AIQueryRequest, AIQueryResponse, ChartSpec, etc.)
- Unit tests for SQL validator (comprehensive edge cases)
- Unit tests for pipeline (mocked OpenAI)
- Integration tests for pipeline (mocked OpenAI, real validator)

### Out of scope
- Read-only DB user creation (task 3.4)
- Query execution against PostgreSQL (task 3.5)
- Specific query categories (tasks 3.6–3.9)
- Chart rendering (task 3.10)
- Chat UI (Sprint 4)

## 3. User Stories
- As the AI pipeline, I need to convert a natural language question into a validated SQL query so that it can be safely executed against the store's data.
- As a developer, I need a SQL validator that rejects any non-SELECT query to prevent data mutation.

## 4. Requirements

### Functional Requirements
- FR1: SQL validator MUST reject any SQL that doesn't start with SELECT
- FR2: SQL validator MUST reject SQL containing forbidden keywords (INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, EXEC, EXECUTE, UNION)
- FR3: SQL validator MUST reject SQL that doesn't reference store_id
- FR4: SQL validator MUST append LIMIT 100 if no LIMIT clause present
- FR5: Pipeline MUST call OpenAI with the system prompt from task 3.1
- FR6: Pipeline MUST parse JSON response and extract sql, explanation, chartSpec
- FR7: Pipeline MUST validate extracted SQL before returning
- FR8: Pipeline MUST handle OpenAI API errors gracefully (timeout, rate limit, invalid response)
- FR9: Pipeline MUST NOT send raw customer PII to OpenAI (question text only)

### Non-functional Requirements
- Performance: Pipeline response < 10 seconds (including OpenAI latency)
- Security: SQL injection prevention via parameterized queries, SELECT-only enforcement
- Reliability: Graceful error handling with AIError for all failure modes
- Observability: Log pipeline requests/responses (without PII)

## 5. UX / API Contract
No direct API endpoints in this task. Internal modules consumed by future chat route.

### Module Exports
- `validateSql(sql: string): SqlValidationResult` — Validates SQL for safety
- `createAIQueryPipeline(deps: PipelineDeps): AIQueryPipeline` — Creates the pipeline service
  - `processQuestion(storeId: string, question: string): Promise<AIQueryResult>` — Runs the full NL→SQL pipeline

### Types
```typescript
interface SqlValidationResult {
  valid: boolean;
  sql: string;           // Possibly modified (LIMIT appended)
  errors: string[];      // Validation error messages
}

interface AIQueryResult {
  sql: string;
  params: string[];      // [storeId]
  explanation: string;
  chartSpec: ChartSpec | null;
}

interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'table';
  title: string;
  xLabel?: string;
  yLabel?: string;
  dataKey: string;
  labelKey: string;
}
```

## 6. Data Model Impact
- No new tables or migrations
- No schema changes

## 7. Integration Impact
- External API: OpenAI GPT-4o (chat completions endpoint)
- Depends on: `backend/src/ai/prompts/system.ts` (task 3.1)
- Depends on: `backend/src/ai/schemaContext.ts` (task 3.1)
- Consumed by: Future chat route (Sprint 4)

## 8. Code Impact

### New files/modules
- `backend/src/ai/sqlValidator.ts` — SQL validation logic
- `backend/src/ai/pipeline.ts` — NL→SQL pipeline (OpenAI integration)
- `backend/src/ai/types.ts` — Shared AI pipeline types
- `backend/tests/unit/ai/sqlValidator.test.ts` — SQL validator unit tests
- `backend/tests/unit/ai/pipeline.test.ts` — Pipeline unit tests
- `backend/tests/integration/aiPipeline.test.ts` — Pipeline integration tests

## 9. Test Plan

### Unit Tests — SQL Validator
- Accepts valid SELECT with store_id and LIMIT
- Rejects INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE
- Rejects SQL without store_id reference
- Appends LIMIT 100 when missing
- Preserves existing LIMIT when present
- Rejects empty/whitespace-only SQL
- Rejects multi-statement SQL (semicolons)
- Handles case-insensitive keyword detection
- Rejects UNION-based injection attempts
- Rejects comment-based injection attempts (-- and /*)

### Unit Tests — Pipeline
- Calls OpenAI with correct system prompt and user message
- Parses valid JSON response correctly
- Validates extracted SQL via validator
- Returns AIQueryResult with sql, params, explanation, chartSpec
- Handles OpenAI API errors (network, rate limit, timeout)
- Handles invalid JSON response from OpenAI
- Handles missing fields in OpenAI response
- Never sends store_id value in the question to OpenAI

### Integration Tests
- Full pipeline: question → system prompt → (mocked) OpenAI → validation → result
- Pipeline rejects dangerous SQL even if OpenAI returns it

### Regression Risks
- None (new module, no existing code changes)

## 10. Rollout Plan
- Feature flag: No
- Migration strategy: N/A
- Backward compatibility: N/A (new code)

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
