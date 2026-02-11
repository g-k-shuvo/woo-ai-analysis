# Feature: Sync Status API — Progress Tracking + WP Admin Progress Bar

**Slug:** sync-status-api
**Status:** In Progress
**Owner:** Backend + Plugin
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Provide a `GET /api/sync/status` endpoint that returns current sync health for a store
- Show record counts per entity type (orders, products, customers, categories)
- Show last sync time and any running/failed sync operations
- Display a sync status panel with progress info in the WP admin settings page
- Plugin fetches sync status via AJAX and renders it in the admin UI

### Acceptance Criteria
- `GET /api/sync/status` returns entity record counts, last sync time, and recent sync log entries
- Every DB query includes `WHERE store_id = ?` for tenant isolation
- Plugin registers a `waa_sync_status` AJAX handler (nonce-protected)
- WP admin settings page shows a "Sync Status" panel when connected
- Panel shows record counts, last sync time, and sync health indicator
- Running syncs show a progress indicator
- Failed syncs show error details
- 90% test coverage

## 2. Scope

### In scope
- Backend `GET /api/sync/status` endpoint returning sync health data
- Backend `syncStatusService.getSyncStatus(storeId)` method
- Plugin AJAX handler `waa_sync_status` that proxies to backend
- Admin UI "Sync Status" panel component in Settings page
- Unit + integration tests for backend
- Auto-refresh of sync status while a sync is running

### Out of scope
- Triggering a full re-sync from the UI (future)
- Sync error handling / retry logic (task 2.7)
- Detailed per-record error logs
- Real-time WebSocket updates

## 3. User Stories
- As a store owner, I want to see how many records have been synced so I know if my data is ready
- As a store owner, I want to see if a sync is currently running so I know to wait before querying
- As a store owner, I want to see if a sync failed so I can take action
- As a developer, I want the sync status API to be efficient and not slow down the admin UI

## 4. Requirements

### Functional Requirements
- FR1: `GET /api/sync/status` returns `{ lastSyncAt, recordCounts: { orders, products, customers, categories }, recentSyncs: [...] }`
- FR2: `recordCounts` are fetched by counting rows per entity table filtered by `store_id`
- FR3: `recentSyncs` returns the last 10 sync_log entries for the store, ordered by `started_at DESC`
- FR4: `lastSyncAt` comes from `stores.last_sync_at`
- FR5: Plugin AJAX handler `waa_sync_status` requires nonce verification and `manage_woocommerce` capability
- FR6: Plugin proxies to `GET /api/sync/status` with Bearer token auth
- FR7: Admin UI shows sync status panel only when store is connected
- FR8: Panel auto-refreshes every 10 seconds while a sync is `running`
- FR9: Every DB query includes `WHERE store_id = ?`

### Non-functional Requirements
- Performance: Endpoint should respond in < 500ms (simple count queries)
- Security: Auth required, store_id isolation on every query
- Reliability: Graceful error handling on both backend and plugin side

## 5. UX / API Contract

### GET /api/sync/status (Auth required)
```json
// Response 200
{
  "success": true,
  "data": {
    "lastSyncAt": "2026-02-11T10:30:00Z",
    "recordCounts": {
      "orders": 1250,
      "products": 85,
      "customers": 420,
      "categories": 12
    },
    "recentSyncs": [
      {
        "id": "uuid",
        "syncType": "orders",
        "recordsSynced": 50,
        "status": "completed",
        "startedAt": "2026-02-11T10:30:00Z",
        "completedAt": "2026-02-11T10:30:05Z",
        "errorMessage": null
      },
      {
        "id": "uuid",
        "syncType": "webhook:orders",
        "recordsSynced": 1,
        "status": "completed",
        "startedAt": "2026-02-11T10:35:00Z",
        "completedAt": "2026-02-11T10:35:01Z",
        "errorMessage": null
      }
    ]
  }
}
```

### Plugin AJAX: waa_sync_status
- Action: `waa_sync_status`
- Nonce: `waa_nonce`
- Capability: `manage_woocommerce`
- Returns: `wp_send_json_success({ ... })` with backend response data

## 6. Data Model Impact
- No new tables
- No migrations needed
- Reads from existing tables: `stores`, `orders`, `products`, `customers`, `categories`, `sync_logs`

## 7. Integration Impact
- Auth: Existing Bearer token auth middleware
- No external APIs affected
- Plugin AJAX: New `waa_sync_status` action

## 8. Code Impact

### Files/modules likely to change
- `backend/src/index.ts` — register sync status route
- `backend/src/services/syncService.ts` — add `getSyncStatus` method
- `plugin/includes/class-settings.php` — add AJAX handler for sync status
- `plugin/includes/class-admin-ui.php` — pass connected state to JS
- `plugin/admin/src/components/Settings.jsx` — add SyncStatus panel

### New files/modules
- `backend/src/routes/sync/status.ts` — GET /api/sync/status route
- `plugin/admin/src/components/SyncStatus.jsx` — Sync status panel component
- `backend/tests/unit/syncStatusService.test.ts` — unit tests
- `backend/tests/integration/syncStatus.test.ts` — integration tests

## 9. Test Plan

### Unit Tests (syncService.getSyncStatus)
- Returns record counts for all entity types with store_id filtering
- Returns lastSyncAt from stores table
- Returns recent sync logs ordered by started_at DESC, limited to 10
- Returns null lastSyncAt when store has never synced
- Returns zero counts when store has no data
- Returns empty recentSyncs array when no sync logs exist
- Throws on database error

### Integration Tests (GET /api/sync/status)
- 200 with complete sync status data
- 200 with zero counts for new store
- Passes store.id from auth context
- 500 when service throws error

## 10. Rollout Plan
- No feature flag needed
- No migration needed
- Backward compatible (new endpoint + AJAX handler)
- Plugin UI gracefully handles missing endpoint (shows error message)

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
