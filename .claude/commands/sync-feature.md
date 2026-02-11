# Implement WooCommerce Data Sync Feature

Implement a new data sync capability for: **$ARGUMENTS**

## Pre-requisites
Read these files first:
- `agent_docs/data_sync.md` — sync architecture and patterns
- `docs/ai/integrations.md` — WooCommerce integration details
- `docs/ai/datamodel.md` — database schema

## Steps

1. **Plugin Side (PHP)**:
   - Add the WooCommerce webhook handler in `plugin/includes/class-sync-manager.php`
   - Register the webhook in the plugin activation hook
   - Implement data transformation (WC format → sync payload)
   - Handle errors gracefully (retry logic, logging)
   - Must be HPOS-compatible (use `$order->get_id()` not `$post->ID`)

2. **Backend Side (TypeScript)**:
   - Create the API endpoint in `backend/src/routes/sync/` to receive the data
   - Create/update the Knex migration if new tables/columns are needed
   - Implement upsert logic (insert if new, update if exists)
   - Add `store_id` to every record for tenant isolation
   - Add sync logging to `sync_logs` table

3. **Testing**:
   - Unit tests for data transformation (PHP side)
   - Unit tests for upsert logic (backend side)
   - Integration test: mock WC webhook → verify data in DB
   - Test error scenarios: network failure, invalid data, duplicate records

4. **Update Docs**:
   - Update `docs/ai/datamodel.md` if schema changed
   - Update `docs/ai/integrations.md` with the new webhook
   - Update `agent_docs/data_sync.md` with the new sync type

5. **Update Feature Spec**: Mark sync-related tasks as complete in the feature spec

## Verification
- Run `cd backend && npm test` — all tests pass
- Run `cd plugin && composer test` — all tests pass
- Verify data isolation: synced data includes `store_id` in every query
