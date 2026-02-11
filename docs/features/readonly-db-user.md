# Feature: Read-Only DB User — PostgreSQL User with SELECT-Only Permissions

**Slug:** readonly-db-user
**Status:** In Progress
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Create a dedicated PostgreSQL read-only user for executing AI-generated SQL queries, enforcing defense-in-depth: even if the SQL validator is bypassed, the DB user itself cannot mutate data.
- Provide a separate Knex connection pool using this read-only user, with a statement timeout for safety.
- Success criteria: AI queries execute via a connection that PostgreSQL physically prevents from INSERT/UPDATE/DELETE/DROP/CREATE. Unit and integration tests prove this enforcement.

## 2. Scope

### In scope
- Complete the `init-readonly-user.sql` Docker init script (grant SELECT on existing + future tables)
- Create `backend/src/db/readonlyConnection.ts` — a Knex connection pool using `DATABASE_READONLY_URL`
- Statement timeout on the read-only connection (5 seconds)
- Unit tests for connection factory
- Integration tests proving write operations fail on the read-only connection
- Wire read-only connection into `index.ts` with graceful shutdown

### Out of scope
- Query execution service (task 3.5)
- Modifying the AI pipeline to use this connection (task 3.5)
- Production PostgreSQL provisioning (ops concern)

## 3. User Stories
- As the AI pipeline, I need a database connection that can only SELECT data so that even a validator bypass cannot damage or exfiltrate data via writes.
- As a developer, I need a clearly separated read-only connection pool so that I never accidentally use it for writes.

## 4. Requirements

### Functional Requirements
- FR1: PostgreSQL user `woo_ai_readonly` MUST only have SELECT privileges on all tables in the `public` schema
- FR2: The read-only connection MUST use a separate Knex pool (`readonlyDb`)
- FR3: The read-only connection MUST enforce a 5-second statement timeout
- FR4: The read-only connection MUST reject INSERT, UPDATE, DELETE, DROP, CREATE, TRUNCATE at the PostgreSQL level
- FR5: The `init-readonly-user.sql` MUST grant SELECT on all current and future tables
- FR6: The `readonlyDb` factory MUST accept a connection URL and return a Knex instance

### Non-functional Requirements
- Performance: Read-only pool min 1, max 5 connections (AI queries are sequential per store)
- Security: Defense-in-depth — DB-level enforcement on top of SQL validator
- Reliability: Connection pool with health check
- Observability: Log read-only pool creation

## 5. UX / API Contract
No direct API endpoints. Internal module consumed by the future query execution service (task 3.5).

### Module Exports
```typescript
// backend/src/db/readonlyConnection.ts
export function createReadonlyDb(connectionUrl: string): Knex;
```

## 6. Data Model Impact
- No new tables or migrations
- New PostgreSQL user: `woo_ai_readonly` (created via Docker init script, not Knex migration)
- Permissions: SELECT-only on all tables in public schema

## 7. Integration Impact
- Docker Compose: `init-readonly-user.sql` mounted as init script (already configured)
- Config: `DATABASE_READONLY_URL` env var (already in `config.ts`)
- Consumed by: Future query execution service (task 3.5)

## 8. Code Impact

### Files/modules likely to change
- `backend/db/init-readonly-user.sql` — Complete the SQL grants
- `backend/src/index.ts` — Add readonlyDb creation and shutdown

### New files/modules
- `backend/src/db/readonlyConnection.ts` — Read-only Knex connection factory
- `backend/tests/unit/db/readonlyConnection.test.ts` — Unit tests
- `backend/tests/integration/readonlyDb.test.ts` — Integration tests

## 9. Test Plan

### Unit Tests — readonlyConnection
- Creates a Knex instance with pg client
- Uses the provided connection URL
- Sets pool min=1, max=5
- Sets statement_timeout to 5000ms via afterCreate hook
- Exposes the Knex instance for querying

### Integration Tests — read-only enforcement
- SELECT queries succeed via readonlyDb
- INSERT is rejected by PostgreSQL with permission denied
- UPDATE is rejected by PostgreSQL with permission denied
- DELETE is rejected by PostgreSQL with permission denied
- DROP TABLE is rejected by PostgreSQL with permission denied
- CREATE TABLE is rejected by PostgreSQL with permission denied
- TRUNCATE is rejected by PostgreSQL with permission denied
- Statement timeout kills long-running queries

### Regression Risks
- None (new module, no changes to existing query paths)

## 10. Rollout Plan
- Feature flag: No
- Migration strategy: N/A (Docker init script handles user creation)
- Backward compatibility: N/A (new code, no existing consumers)

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
