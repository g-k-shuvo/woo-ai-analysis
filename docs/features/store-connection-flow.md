# Feature: Store Connection Flow

**Slug:** store-connection-flow
**Status:** In Progress
**Owner:** Backend + Plugin
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Allow a WooCommerce store owner to securely connect their store to the SaaS backend
- Plugin generates a random API key, sends it to the backend along with the store URL
- Backend hashes the key with bcrypt and stores the store record
- All subsequent requests use `Authorization: Bearer <api_key>` for authentication

### Acceptance Criteria
- Store owner can connect from WP admin Settings page
- Backend creates a `stores` record with bcrypt-hashed API key
- Store owner can check connection status
- Store owner can disconnect (backend deletes all store data)
- Auth middleware validates API key on all protected routes

## 2. Scope

### In scope
- `POST /api/stores/connect` — register a new store
- `GET /api/stores/status` — check connection & sync health (auth required)
- `DELETE /api/stores/disconnect` — disconnect and delete data (auth required)
- Auth middleware — validates Bearer token on protected routes
- Plugin Settings class — generates API key, calls connect endpoint
- Plugin Settings.jsx — UI for connect/disconnect flow

### Out of scope
- Rate limiting (task 2.2 covers this separately as part of auth middleware)
- Data sync endpoints (task 2.3+)
- WooCommerce webhook registration (task 2.5)

## 3. User Stories
- As a store owner, I want to connect my WooCommerce store to the analytics service so I can start syncing data
- As a store owner, I want to see my connection status so I know if the service is active
- As a store owner, I want to disconnect my store so all my data is deleted from the service

## 4. Requirements

### Functional Requirements
- FR1: Plugin generates a 64-character random API key using `wp_generate_password(64, false)`
- FR2: Plugin POSTs `{ storeUrl, apiKey, wcVersion }` to backend `/api/stores/connect`
- FR3: Backend hashes the API key with bcrypt (12 rounds) and stores in `stores` table
- FR4: Backend returns `{ storeId }` on successful connection
- FR5: Plugin stores the raw API key in `wp_options` as `waa_store_api_key`
- FR6: Auth middleware extracts Bearer token, looks up store by comparing bcrypt hash
- FR7: `GET /api/stores/status` returns store info, sync health, record counts
- FR8: `DELETE /api/stores/disconnect` cascading deletes all store data
- FR9: Duplicate `store_url` connection replaces the old API key (re-connect scenario)

### Non-functional Requirements
- Security: API key hashed with bcrypt, never stored plaintext on backend
- Security: Auth middleware on all routes except `/health` and `/api/stores/connect`
- Performance: Auth lookup uses indexed `store_url` column
- Reliability: Connection errors return clear error messages

## 5. UX / API Contract

### POST /api/stores/connect
```json
// Request
{ "storeUrl": "https://myshop.com", "apiKey": "abc...64chars", "wcVersion": "9.0" }

// Response 201
{ "success": true, "data": { "storeId": "uuid" } }

// Response 400
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }

// Response 409
{ "success": false, "error": { "code": "STORE_ALREADY_CONNECTED", "message": "..." } }
```

### GET /api/stores/status (Auth required)
```json
// Response 200
{
  "success": true,
  "data": {
    "storeId": "uuid",
    "storeUrl": "https://myshop.com",
    "plan": "free",
    "connectedAt": "2026-01-01T00:00:00Z",
    "lastSyncAt": null,
    "isActive": true
  }
}
```

### DELETE /api/stores/disconnect (Auth required)
```json
// Response 200
{ "success": true, "data": { "message": "Store disconnected and all data deleted." } }
```

## 6. Data Model Impact
- No new tables — uses existing `stores` table
- No migrations needed
- `store_url` is UNIQUE — used for lookup during auth

## 7. Integration Impact
- WooCommerce: Reads `wc_version` from `WC()->version`
- Auth: Bearer token in `Authorization` header

## 8. Code Impact

### Files/modules likely to change
- `backend/src/index.ts` — register new routes and auth middleware
- `plugin/includes/class-settings.php` — add connect AJAX handler

### New files/modules
- `backend/src/services/storeService.ts` — store CRUD operations
- `backend/src/routes/stores.ts` — store connection routes
- `backend/src/middleware/auth.ts` — API key validation middleware
- `backend/tests/unit/storeService.test.ts`
- `backend/tests/unit/auth.test.ts`
- `backend/tests/integration/stores.test.ts`

## 9. Test Plan

### Unit Tests
- storeService: createStore, getStoreByUrl, getStoreById, verifyApiKey, deleteStore
- auth middleware: valid key, invalid key, missing header, inactive store

### Integration Tests
- POST /api/stores/connect: success, validation errors, duplicate URL
- GET /api/stores/status: authenticated, unauthenticated
- DELETE /api/stores/disconnect: authenticated, cascading delete

## 10. Rollout Plan
- No feature flag needed
- No migration needed (stores table already exists)
- Backward compatible (new endpoints only)

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
