# Feature: AI System Prompt — Schema Injection + Few-Shot Examples

**Slug:** ai-system-prompt
**Status:** In Progress
**Owner:** Backend
**Created:** 2026-02-11
**Last updated:** 2026-02-11

## 1. Objective
- Build the system prompt module that injects the store's database schema and metadata into the OpenAI API system prompt, enabling accurate NL-to-SQL conversion.
- Include few-shot question→SQL examples that teach the model the correct SQL patterns for WooCommerce analytics.
- Success criteria: System prompt correctly includes all table schemas, store-specific metadata (date ranges, currency, counts), and 10+ few-shot examples covering revenue, product, customer, and order query categories.

## 2. Scope

### In scope
- System prompt template with schema injection
- Dynamic store metadata fetching (date ranges, currency, order/product counts)
- Few-shot NL→SQL examples (10–15 pairs)
- Schema context service that queries the DB for store metadata
- Unit + integration tests

### Out of scope
- NL→SQL pipeline execution (task 3.2)
- SQL validation (task 3.3)
- OpenAI API calls (task 3.2)
- Chart spec generation (task 3.10)

## 3. User Stories
- As the AI pipeline, I need a system prompt with the store's schema so that GPT-4o generates accurate SQL queries.
- As a developer, I need few-shot examples so the AI learns correct WooCommerce SQL patterns.

## 4. Requirements

### Functional Requirements
- FR1: System prompt MUST include all 6 queryable table schemas (orders, order_items, products, customers, categories, coupons)
- FR2: System prompt MUST include store-specific metadata (earliest/latest order date, currency, total orders, total products)
- FR3: System prompt MUST include critical rules (store_id filter, SELECT-only, LIMIT)
- FR4: Few-shot examples MUST cover 4 categories: revenue, product, customer, order queries
- FR5: All example SQL MUST use parameterized store_id ($1) and include LIMIT clauses
- FR6: Schema context service MUST query store metadata with `WHERE store_id = ?`

### Non-functional Requirements
- Performance: Schema context fetch < 500ms
- Security: store_id tenant isolation in all DB queries
- Reliability: Graceful handling when store has no orders yet

## 5. UX / API Contract
No direct API endpoints. Internal modules consumed by NL→SQL pipeline (task 3.2).

### Module Exports
- `buildSystemPrompt(storeContext: StoreContext): string` — Builds the full system prompt
- `getFewShotExamples(): FewShotExample[]` — Returns all few-shot examples
- `getSchemaContext(db: Knex, storeId: string): Promise<StoreContext>` — Fetches store metadata

## 6. Data Model Impact
- No new tables or migrations
- Reads from: orders, products, customers, categories, coupons, stores

## 7. Integration Impact
- No WooCommerce hooks affected
- No external API calls (OpenAI integration is task 3.2)
- Consumed by: `backend/src/ai/pipeline.ts` (future task 3.2)

## 8. Code Impact

### New files/modules
- `backend/src/ai/prompts/system.ts` — System prompt builder
- `backend/src/ai/prompts/examples.ts` — Few-shot NL→SQL examples
- `backend/src/ai/schemaContext.ts` — Store metadata fetcher
- `backend/tests/unit/ai/systemPrompt.test.ts` — Unit tests for prompt builder
- `backend/tests/unit/ai/examples.test.ts` — Unit tests for few-shot examples
- `backend/tests/unit/ai/schemaContext.test.ts` — Unit tests for schema context service

## 9. Test Plan

### Unit Tests
- System prompt contains all table schemas
- System prompt includes store metadata placeholders
- System prompt includes critical rules
- Few-shot examples all contain store_id and are SELECT-only
- Few-shot examples cover all 4 categories
- Schema context handles empty stores gracefully

### Integration Tests
- Schema context service queries real DB structure (mock Knex)

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
