# Feature: Sync Error Handling

**Slug:** sync-error-handling
**Status:** In Progress
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Sync operations (full + incremental) can fail due to network issues, WooCommerce API limits, or transient DB errors. Currently, failures are logged but never retried.
- Add retry logic with exponential backoff, structured error logging, and a fallback cron that detects stale/failed syncs and re-queues them.
- **Success criteria:** Failed syncs auto-retry up to 5 times with exponential backoff; API exposes failed syncs for visibility; stale "running" syncs older than 15 min are auto-failed and retried.

## 2. Scope

### In scope
- Add `retry_count` and `next_retry_at` columns to `sync_logs`
- `SyncRetryService` — exponential backoff retry logic
- `GET /api/sync/errors` — list failed/retryable syncs for a store
- `POST /api/sync/retry/:syncLogId` — manually trigger retry of a specific failed sync
- Fallback cron: detect stale "running" syncs (>15 min), mark them failed, schedule retry

### Out of scope
- BullMQ-based job queue (deferred to later sprint)
- Plugin-side error UI (separate feature)
- Alerting/notifications on sync failure

## 3. User Stories
- As a store owner, I want failed syncs to automatically retry so I don't lose data.
- As a store owner, I want to see which syncs failed and why via the API.
- As a store owner, I want to manually trigger a retry for a specific failed sync.

## 4. Requirements

### Functional Requirements
- FR1: `sync_logs` gains `retry_count` (default 0) and `next_retry_at` (nullable timestamp)
- FR2: When a sync fails, if retry_count < MAX_RETRIES (5), schedule next retry with exponential backoff (base 30s, 2^n * 30s, max 15 min)
- FR3: `getFailedSyncs(storeId)` returns all failed syncs with retry_count < MAX_RETRIES
- FR4: `processRetries(storeId)` picks up syncs where `next_retry_at <= now` and re-runs them
- FR5: `retrySyncById(storeId, syncLogId)` manually retries a single failed sync
- FR6: `detectStaleSyncs(storeId)` marks syncs stuck in "running" for >15 min as "failed"
- FR7: `GET /api/sync/errors` returns failed syncs for the authenticated store
- FR8: `POST /api/sync/retry/:syncLogId` triggers manual retry

### Non-functional Requirements
- All DB queries include `WHERE store_id = ?`
- Max 5 retries per sync log entry
- Backoff: 30s, 60s, 120s, 240s, 480s (capped at 15 min)
- Stale sync detection threshold: 15 minutes

## 5. UX / API Contract

### GET /api/sync/errors
**Response 200:**
```json
{
  "success": true,
  "data": {
    "failedSyncs": [
      {
        "id": "uuid",
        "syncType": "orders",
        "errorMessage": "DB connection failed",
        "retryCount": 2,
        "nextRetryAt": "2026-02-11T12:05:00Z",
        "startedAt": "2026-02-11T12:00:00Z"
      }
    ]
  }
}
```

### POST /api/sync/retry/:syncLogId
**Response 200:**
```json
{
  "success": true,
  "data": {
    "syncLogId": "uuid",
    "status": "retry_scheduled",
    "nextRetryAt": "2026-02-11T12:05:30Z"
  }
}
```

## 6. Data Model Impact
- **Changed table:** `sync_logs`
  - `retry_count INTEGER DEFAULT 0`
  - `next_retry_at TIMESTAMPTZ` (nullable)
- Migration needed: yes (alter table add columns)

## 7. Integration Impact
- No WooCommerce hooks affected
- No external APIs affected
- Auth: uses existing API key auth middleware

## 8. Code Impact

### New files/modules
- `backend/db/migrations/20260211000011_add_sync_retry_columns.ts`
- `backend/src/services/syncRetryService.ts`
- `backend/src/routes/sync/errors.ts`
- `backend/tests/unit/syncRetryService.test.ts`
- `backend/tests/integration/syncErrors.test.ts`

## 9. Test Plan

### Unit Tests
- `syncRetryService.test.ts`: getFailedSyncs, scheduleRetry, processRetries, retrySyncById, detectStaleSyncs
- Exponential backoff calculation
- Max retry enforcement
- Stale sync detection

### Integration Tests
- `syncErrors.test.ts`: GET /api/sync/errors, POST /api/sync/retry/:syncLogId
- Auth required on both endpoints
- Store isolation (no cross-store access)

## 10. Rollout Plan
- Feature flag: no
- Migration: additive (new columns with defaults, no breaking changes)
- Backward compatible: yes (new columns are nullable/defaulted)

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
