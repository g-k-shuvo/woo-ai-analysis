# Feature: Query Execution

**Slug:** query-execution
**Status:** Done
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Execute AI-validated SQL queries against the read-only PostgreSQL connection and return structured results.
- This is the final step in the AI pipeline: after NL→SQL conversion and validation, the SQL must be executed and results returned to the caller.
- Success criteria: validated SQL runs against `readonlyDb`, results are returned as typed rows, errors are handled gracefully (timeout, permission denied, syntax errors), and execution metadata (duration, row count) is logged.

## 2. Scope

### In scope
- `queryExecutor` module that accepts validated `AIQueryResult` and executes it via `readonlyDb`
- Execution timing and structured logging
- Row count enforcement (reject if exceeds MAX_ROWS)
- Error classification (timeout, permission denied, syntax, generic)
- `QueryExecutionResult` type containing rows, rowCount, and durationMs
- Unit tests (mocked Knex) and integration tests (real readonly DB)

### Out of scope
- Chart rendering from results (task 3.10)
- API route/endpoint for chat (task 4.x)
- Caching of query results (future enhancement)

## 3. User Stories
- As the AI pipeline, I want to execute a validated SQL query so that the user receives data results.
- As an operator, I want query execution to be logged with duration and row count so I can monitor performance.

## 4. Requirements

### Functional Requirements
- FR1: Accept an `AIQueryResult` (sql + params) and execute via `readonlyDb.raw(sql, params)`
- FR2: Return `QueryExecutionResult` with rows (Record<string, unknown>[]), rowCount, durationMs
- FR3: Enforce a maximum row limit (1000 rows) — truncate if exceeded
- FR4: Log execution start, completion (with duration + rowCount), and errors
- FR5: Classify errors: timeout → user-friendly message, permission denied → internal error, syntax → AIError

### Non-functional Requirements
- Performance: Query execution inherits 5-second timeout from readonlyDb connection pool
- Security: Only runs pre-validated SELECT queries with parameterized store_id
- Observability: Structured pino logging with storeId, durationMs, rowCount

## 5. UX / API Contract

### Module API
```typescript
interface QueryExecutorDeps {
  readonlyDb: Knex;
}

function createQueryExecutor(deps: QueryExecutorDeps) {
  async function execute(queryResult: AIQueryResult): Promise<QueryExecutionResult>;
  return { execute };
}
```

### Return type
```typescript
interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}
```

## 6. Data Model Impact
- No new tables or migrations required.
- Reads existing tables via read-only connection.

## 7. Integration Impact
- Uses `readonlyDb` (Knex instance with `woo_ai_readonly` PostgreSQL user)
- No external API calls.

## 8. Code Impact

### Files/modules likely to change
- `backend/src/ai/types.ts` — add `QueryExecutionResult` interface

### New files/modules
- `backend/src/ai/queryExecutor.ts` — query execution module
- `backend/tests/unit/ai/queryExecutor.test.ts` — unit tests
- `backend/tests/integration/queryExecution.test.ts` — integration tests

## 9. Test Plan

### Unit Tests
- Executes SQL with correct params via readonlyDb.raw
- Returns rows, rowCount, durationMs
- Truncates rows to MAX_ROWS if exceeded
- Handles timeout errors with user-friendly message
- Handles permission denied errors
- Handles SQL syntax errors
- Handles empty result sets (returns [])
- Logs execution start and completion
- Logs errors

### Integration Tests
- Executes a real SELECT query against readonly DB
- Returns correct row data
- Respects statement timeout
- Handles parameterized queries with store_id

### Regression Risks
- None — new module, no existing code modified (only types.ts extended)

## 10. Rollout Plan
- No feature flag needed
- No migration
- Backward compatible — additive change only

## 11. Checklist
- [ ] Plan reviewed
- [ ] Feature spec approved
- [x] Tests added/updated
- [x] Lint/test/build pass
- [x] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
