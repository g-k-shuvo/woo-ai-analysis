# Feature: Initial Full Sync — Orders

**Slug:** initial-orders-sync
**Status:** In Progress
**Owner:** Backend + Plugin
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Accept batches of WooCommerce order data from the plugin and upsert them into PostgreSQL
- Track sync progress via sync_logs table
- Enable the plugin to perform a full initial sync of all orders after store connection

### Acceptance Criteria
- `POST /api/sync/orders` accepts a batch of orders and upserts them (insert or update on conflict)
- Order items within each order are also upserted
- Every DB query includes `WHERE store_id = ?` for tenant isolation
- Sync progress is tracked in `sync_logs` table
- Invalid orders in a batch are skipped (logged) without failing the entire batch
- Customer references are resolved by `wc_customer_id` lookup
- 90% test coverage

## 2. Scope

### In scope
- `POST /api/sync/orders` — upsert orders + order items batch
- `syncService.ts` — service layer for data upsert logic
- Sync log creation and completion tracking
- Input validation (required fields, types)
- Transaction-based upserts with rollback on failure

### Out of scope
- Products, customers, categories sync (task 2.4)
- Incremental sync / webhooks (task 2.5)
- Sync status API / progress bar (task 2.6)
- Retry logic and error recovery (task 2.7)
- Plugin-side batch reading from WooCommerce

## 3. User Stories
- As a store owner, I want my WooCommerce orders to be synced to the analytics backend so that I can query them with AI
- As a developer, I want batch upsert to be idempotent so re-syncing the same orders doesn't create duplicates

## 4. Requirements

### Functional Requirements
- FR1: `POST /api/sync/orders` accepts `{ orders: [...] }` array
- FR2: Each order must have: `wc_order_id`, `date_created`, `status`, `total`
- FR3: Orders are upserted using `ON CONFLICT (store_id, wc_order_id) DO UPDATE`
- FR4: Order items for an order are replaced on each sync (old items are deleted, new items are inserted)
- FR5: Old order items not in the new payload are deleted (full replacement per order)
- FR6: A `sync_logs` entry is created at start (status=running) and updated on completion
- FR7: `store.last_sync_at` is updated on successful sync
- FR8: Invalid individual orders are skipped with error logging (batch continues)
- FR9: Empty orders array returns success with 0 records synced

### Non-functional Requirements
- Security: All queries include `store_id` filter (tenant isolation)
- Performance: Batch upsert within a single transaction
- Reliability: Transaction rollback on failure
- Observability: Sync logs track records_synced, status, error_message

## 5. UX / API Contract

### POST /api/sync/orders (Auth required)
```json
// Request
{
  "orders": [
    {
      "wc_order_id": 1001,
      "date_created": "2026-01-15T10:30:00Z",
      "date_modified": "2026-01-15T12:00:00Z",
      "status": "completed",
      "total": 99.99,
      "subtotal": 89.99,
      "tax_total": 5.00,
      "shipping_total": 5.00,
      "discount_total": 0,
      "currency": "USD",
      "customer_id": 42,
      "payment_method": "stripe",
      "coupon_used": "",
      "items": [
        {
          "product_name": "Blue Widget",
          "sku": "BW-001",
          "quantity": 2,
          "subtotal": 44.99,
          "total": 49.99,
          "wc_product_id": 501
        }
      ]
    }
  ]
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

// Response 400 (validation error)
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "orders must be an array"
  }
}
```

## 6. Data Model Impact
- No new tables — uses existing `orders`, `order_items`, `sync_logs` tables
- No migrations needed
- Upsert on `(store_id, wc_order_id)` unique constraint

## 7. Integration Impact
- Auth: Bearer token required (existing auth middleware)
- Plugin: Will POST order batches after initial connection

## 8. Code Impact

### Files/modules likely to change
- `backend/src/index.ts` — register sync routes and service

### New files/modules
- `backend/src/services/syncService.ts` — order upsert logic
- `backend/src/routes/sync/orders.ts` — POST /api/sync/orders route
- `backend/tests/unit/syncService.test.ts`
- `backend/tests/integration/syncOrders.test.ts`

## 9. Test Plan

### Unit Tests (syncService)
- upsertOrders: successful batch upsert, creates sync log
- upsertOrders: empty array returns 0 synced
- upsertOrders: skips invalid orders (missing required fields)
- upsertOrders: upserts order items for each order
- upsertOrders: deletes old order items before inserting new ones
- upsertOrders: updates store.last_sync_at
- upsertOrders: rolls back transaction on DB error
- upsertOrders: validates required fields (wc_order_id, date_created, status, total)

### Integration Tests (sync routes)
- POST /api/sync/orders: 200 success with valid batch
- POST /api/sync/orders: 200 with empty orders array
- POST /api/sync/orders: 400 when orders is not an array
- POST /api/sync/orders: 400 when body is missing orders field
- POST /api/sync/orders: handles partial failures (some invalid orders)
- POST /api/sync/orders: 500 on sync service error

## 10. Rollout Plan
- No feature flag needed
- No migration needed (tables already exist)
- Backward compatible (new endpoint only)

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
