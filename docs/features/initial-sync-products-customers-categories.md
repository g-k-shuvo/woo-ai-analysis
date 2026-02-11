# Feature: Initial Full Sync — Products + Customers + Categories

**Slug:** initial-sync-products-customers-categories
**Status:** In Progress
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Accept batches of WooCommerce products, customers, and categories from the plugin and upsert them into PostgreSQL
- Track sync progress via sync_logs table for each entity type
- Follows the same patterns established in task 2.3 (orders sync)

### Acceptance Criteria
- `POST /api/sync/products` accepts a batch of products and upserts them
- `POST /api/sync/customers` accepts a batch of customers and upserts them (email hashed with SHA256)
- `POST /api/sync/categories` accepts a batch of categories and upserts them
- Every DB query includes `WHERE store_id = ?` for tenant isolation
- Sync progress is tracked in `sync_logs` table
- Invalid records in a batch are skipped without failing the entire batch
- Customer emails are stored as SHA256 hashes (never plaintext PII)
- 90% test coverage

## 2. Scope

### In scope
- `POST /api/sync/products` — upsert products batch
- `POST /api/sync/customers` — upsert customers batch
- `POST /api/sync/categories` — upsert categories batch
- Service layer methods in `syncService.ts` for each entity
- Sync log creation and completion tracking per entity
- Input validation (required fields, types)
- Transaction-based upserts with rollback on failure

### Out of scope
- Incremental sync / webhooks (task 2.5)
- Sync status API / progress bar (task 2.6)
- Retry logic and error recovery (task 2.7)
- Plugin-side batch reading from WooCommerce

## 3. User Stories
- As a store owner, I want my products synced so AI can answer product-related questions
- As a store owner, I want my customers synced so AI can analyze customer behavior (without exposing PII)
- As a store owner, I want my categories synced so AI can report on category performance

## 4. Requirements

### Functional Requirements
- FR1: `POST /api/sync/products` accepts `{ products: [...] }` array
- FR2: Each product must have: `wc_product_id`, `name`
- FR3: Products are upserted using `ON CONFLICT (store_id, wc_product_id) DO UPDATE`
- FR4: Category references are resolved by `wc_category_id` lookup
- FR5: `POST /api/sync/customers` accepts `{ customers: [...] }` array
- FR6: Each customer must have: `wc_customer_id`
- FR7: Customer `email` is hashed with SHA256 before storage (never stored as plaintext)
- FR8: Customers are upserted using `ON CONFLICT (store_id, wc_customer_id) DO UPDATE`
- FR9: `POST /api/sync/categories` accepts `{ categories: [...] }` array
- FR10: Each category must have: `wc_category_id`, `name`
- FR11: Categories are upserted using `ON CONFLICT (store_id, wc_category_id) DO UPDATE`
- FR12: Parent category references are resolved by `wc_category_id` lookup
- FR13: A `sync_logs` entry is created at start (status=running) and updated on completion for each entity
- FR14: `store.last_sync_at` is updated on successful sync
- FR15: Invalid individual records are skipped with error logging (batch continues)
- FR16: Empty array returns success with 0 records synced

### Non-functional Requirements
- Security: All queries include `store_id` filter (tenant isolation)
- Security: Customer PII (email) is SHA256 hashed before storage
- Performance: Batch upsert within a single transaction
- Reliability: Transaction rollback on failure
- Observability: Sync logs track records_synced, status, error_message

## 5. UX / API Contract

### POST /api/sync/products (Auth required)
```json
// Request
{
  "products": [
    {
      "wc_product_id": 501,
      "name": "Blue Widget",
      "sku": "BW-001",
      "price": 24.99,
      "regular_price": 29.99,
      "sale_price": 24.99,
      "category_id": 10,
      "category_name": "Widgets",
      "stock_quantity": 50,
      "stock_status": "instock",
      "status": "publish",
      "type": "simple",
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-15T10:30:00Z"
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
```

### POST /api/sync/customers (Auth required)
```json
// Request
{
  "customers": [
    {
      "wc_customer_id": 42,
      "email": "john@example.com",
      "display_name": "John D.",
      "total_spent": 499.95,
      "order_count": 5,
      "first_order_date": "2025-06-01T00:00:00Z",
      "last_order_date": "2026-01-15T10:30:00Z",
      "created_at": "2025-05-20T00:00:00Z"
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
```

### POST /api/sync/categories (Auth required)
```json
// Request
{
  "categories": [
    {
      "wc_category_id": 10,
      "name": "Widgets",
      "parent_id": null,
      "product_count": 25
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
```

## 6. Data Model Impact
- No new tables — uses existing `products`, `customers`, `categories`, `sync_logs` tables
- No migrations needed
- Upsert on existing unique constraints

## 7. Integration Impact
- Auth: Bearer token required (existing auth middleware)
- Plugin: Will POST entity batches after initial connection

## 8. Code Impact

### Files/modules likely to change
- `backend/src/services/syncService.ts` — add upsertProducts, upsertCustomers, upsertCategories
- `backend/src/index.ts` — register new sync routes

### New files/modules
- `backend/src/routes/sync/products.ts` — POST /api/sync/products route
- `backend/src/routes/sync/customers.ts` — POST /api/sync/customers route
- `backend/src/routes/sync/categories.ts` — POST /api/sync/categories route
- `backend/tests/unit/syncService.products.test.ts`
- `backend/tests/unit/syncService.customers.test.ts`
- `backend/tests/unit/syncService.categories.test.ts`
- `backend/tests/integration/syncProducts.test.ts`
- `backend/tests/integration/syncCustomers.test.ts`
- `backend/tests/integration/syncCategories.test.ts`

## 9. Test Plan

### Unit Tests (syncService)
**Products:**
- upsertProducts: successful batch upsert, creates sync log
- upsertProducts: empty array returns 0 synced
- upsertProducts: skips invalid products (missing required fields)
- upsertProducts: resolves category_id by wc_category_id lookup
- upsertProducts: updates store.last_sync_at
- upsertProducts: rolls back transaction on DB error
- upsertProducts: validates required fields (wc_product_id, name)

**Customers:**
- upsertCustomers: successful batch upsert, creates sync log
- upsertCustomers: empty array returns 0 synced
- upsertCustomers: skips invalid customers (missing wc_customer_id)
- upsertCustomers: hashes email with SHA256 before storage
- upsertCustomers: updates store.last_sync_at
- upsertCustomers: rolls back transaction on DB error
- upsertCustomers: handles customer without email

**Categories:**
- upsertCategories: successful batch upsert, creates sync log
- upsertCategories: empty array returns 0 synced
- upsertCategories: skips invalid categories (missing required fields)
- upsertCategories: resolves parent_id by wc_category_id lookup
- upsertCategories: updates store.last_sync_at
- upsertCategories: rolls back transaction on DB error

### Integration Tests (sync routes)
**Products:**
- POST /api/sync/products: 200 success with valid batch
- POST /api/sync/products: 200 with empty products array
- POST /api/sync/products: 400 when products field is missing
- POST /api/sync/products: 400 when products is not an array
- POST /api/sync/products: 500 on sync service error

**Customers:**
- POST /api/sync/customers: 200 success with valid batch
- POST /api/sync/customers: 200 with empty customers array
- POST /api/sync/customers: 400 when customers field is missing
- POST /api/sync/customers: 400 when customers is not an array
- POST /api/sync/customers: 500 on sync service error

**Categories:**
- POST /api/sync/categories: 200 success with valid batch
- POST /api/sync/categories: 200 with empty categories array
- POST /api/sync/categories: 400 when categories field is missing
- POST /api/sync/categories: 400 when categories is not an array
- POST /api/sync/categories: 500 on sync service error

## 10. Rollout Plan
- No feature flag needed
- No migration needed (tables already exist)
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
