# Feature: Incremental Sync — WooCommerce Webhook Registration + Handlers

**Slug:** incremental-sync-webhooks
**Status:** In Progress
**Owner:** Backend + Plugin
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Keep WooCommerce data synchronized in near real-time after initial full sync
- Register WordPress action hooks that fire on order/product/customer/category changes
- Transform changed entities and send them to the SaaS backend via a unified webhook endpoint

### Acceptance Criteria
- Plugin registers WooCommerce hooks for create/update of orders, products, customers, categories
- On each hook fire, the plugin transforms the WC entity and POSTs it to the backend
- Backend `POST /api/sync/webhook` accepts a single entity event with `{ resource, action, data }`
- Backend delegates to existing upsert methods (wrapping single entities in arrays)
- Webhook handlers do not break WooCommerce operations on failure (try/catch, fire-and-forget)
- Plugin deactivation removes all registered hooks cleanly
- Sync logs correctly record `sync_type` as `webhook:orders`, `webhook:products`, etc.
- Every DB query includes `WHERE store_id = ?` (tenant isolation)
- Customer PII (emails) hashed before storage (existing pattern)
- 90% test coverage

## 2. Scope

### In scope
- Backend `POST /api/sync/webhook` unified endpoint
- Plugin `class-webhooks.php` with WC action hook handlers
- Data transformation for orders (incl. line items), products, customers, categories
- Registration/deregistration of hooks
- Unit + integration tests for backend endpoint
- Sync log entries with `webhook:*` type

### Out of scope
- WooCommerce REST API webhooks (we use direct PHP action hooks instead — more reliable, no webhook secret management)
- Sync status API / progress bar (task 2.6)
- Retry logic and error recovery (task 2.7)
- Coupon incremental sync (deferred)
- Order deletion handling (deferred)

## 3. User Stories
- As a store owner, I want new orders to appear in my analytics within seconds so that my AI queries reflect the latest data
- As a store owner, I want product changes to sync automatically so I don't need to trigger manual re-syncs
- As a developer, I want webhook failures to be logged but not crash WooCommerce operations

## 4. Requirements

### Functional Requirements
- FR1: `POST /api/sync/webhook` accepts `{ resource: "order"|"product"|"customer"|"category", action: "created"|"updated", data: {...} }`
- FR2: Backend wraps single entity data in array and delegates to existing `upsertOrders`/`upsertProducts`/`upsertCustomers`/`upsertCategories`
- FR3: Sync log `sync_type` is `webhook:orders`, `webhook:products`, etc. (distinct from full sync)
- FR4: Plugin hooks into `woocommerce_new_order`, `woocommerce_update_order`, `woocommerce_new_product`, `woocommerce_update_product`, `woocommerce_created_customer`, `woocommerce_update_customer`, `create_product_cat`, `edited_product_cat`
- FR5: Plugin transforms WC_Order, WC_Product, WC_Customer objects to payload format matching existing batch sync schemas
- FR6: Plugin only sends webhook when store is connected (has API key)
- FR7: Errors during webhook send are caught and logged (never propagate to WC)
- FR8: Invalid resource type returns 400 validation error
- FR9: `store_id` is included in every DB query for tenant isolation

### Non-functional Requirements
- Security: All queries include `store_id` filter; auth required on endpoint
- Performance: Non-blocking webhook sends (wp_remote_post with short timeout)
- Reliability: Fire-and-forget; failures logged but don't affect WC operations
- Observability: Sync logs track webhook syncs distinctly from full syncs

## 5. UX / API Contract

### POST /api/sync/webhook (Auth required)
```json
// Request
{
  "resource": "order",
  "action": "updated",
  "data": {
    "wc_order_id": 1001,
    "date_created": "2026-01-15T10:30:00Z",
    "status": "completed",
    "total": 99.99,
    "items": [...]
  }
}

// Response 200
{
  "success": true,
  "data": {
    "syncedCount": 1,
    "skippedCount": 0,
    "syncLogId": "uuid"
  }
}

// Response 400
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid resource type: xyz"
  }
}
```

## 6. Data Model Impact
- No new tables
- No migrations needed
- Reuses existing upsert logic (ON CONFLICT merge)
- New `sync_type` values: `webhook:orders`, `webhook:products`, `webhook:customers`, `webhook:categories`

## 7. Integration Impact
- WooCommerce hooks: `woocommerce_new_order`, `woocommerce_update_order`, `woocommerce_new_product`, `woocommerce_update_product`, `woocommerce_created_customer`, `woocommerce_update_customer`, `create_product_cat`, `edited_product_cat`
- Auth: Existing Bearer token auth middleware
- No external APIs affected

## 8. Code Impact

### Files/modules likely to change
- `backend/src/index.ts` — register webhook route
- `backend/src/services/syncService.ts` — add optional `syncTypePrefix` param or new wrapper methods
- `plugin/includes/class-plugin.php` — load and initialize Webhooks class

### New files/modules
- `backend/src/routes/sync/webhook.ts` — POST /api/sync/webhook route
- `plugin/includes/class-webhooks.php` — WC hook handlers + data transformers
- `backend/tests/unit/webhookService.test.ts` — (covered in syncService tests)
- `backend/tests/integration/syncWebhook.test.ts` — webhook endpoint integration tests

## 9. Test Plan

### Unit Tests (syncService — webhook sync type)
- upsertOrders with `syncType` override: sync log records `webhook:orders`
- upsertProducts with `syncType` override: sync log records `webhook:products`
- upsertCustomers with `syncType` override: sync log records `webhook:customers`
- upsertCategories with `syncType` override: sync log records `webhook:categories`

### Integration Tests (webhook route)
- POST /api/sync/webhook: 200 for valid order created event
- POST /api/sync/webhook: 200 for valid product updated event
- POST /api/sync/webhook: 200 for valid customer created event
- POST /api/sync/webhook: 200 for valid category updated event
- POST /api/sync/webhook: 400 for invalid resource type
- POST /api/sync/webhook: 400 for missing resource field
- POST /api/sync/webhook: 400 for missing data field
- POST /api/sync/webhook: 500 when service throws SyncError
- POST /api/sync/webhook: passes store.id from auth context

## 10. Rollout Plan
- No feature flag needed
- No migration needed
- Backward compatible (new endpoint + plugin hooks)
- Plugin hooks only fire when store is connected

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
