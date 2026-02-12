# Feature: AI Test Suite

**Slug:** ai-test-suite
**Status:** Done
**Owner:** Backend
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Ensure the full AI query pipeline produces correct, safe, and well-structured responses for 50+ real-world WooCommerce analytics questions.
- Validate SQL safety (SELECT-only, store_id isolation, LIMIT enforcement) across all question categories.
- Verify chart spec generation, response contract, and error handling for edge cases.
- Success metric: 50+ test cases covering revenue, product, customer, order, and edge-case categories, all passing.

## 2. Scope

### In scope
- 50+ question-to-answer test cases organized by category (revenue, product, customer, order, edge cases)
- SQL validation assertions (store_id, SELECT-only, LIMIT)
- Chart spec correctness for chart-worthy queries
- Response contract validation (all required fields present)
- Security test cases (injection attempts, dangerous SQL, PII protection)
- Edge cases (empty results, large result sets, ambiguous questions)

### Out of scope
- Real OpenAI API calls (all tests use mocked OpenAI responses)
- Performance benchmarking
- E2E browser tests

## 3. User Stories
- As a developer, I want a comprehensive test suite so that I can confidently verify AI pipeline correctness after changes.
- As a developer, I want security-focused test cases so that SQL injection and tenant isolation are always validated.

## 4. Requirements

### Functional Requirements
- FR1: 50+ test cases covering all 4 query categories (revenue, product, customer, order)
- FR2: Each test case validates: SQL contains store_id = $1, SQL is SELECT-only, LIMIT is present
- FR3: Chart-worthy queries produce valid ChartSpec with correct type, dataKey, labelKey
- FR4: Security tests for SQL injection attempts, forbidden keywords, UNION, and dangerous functions
- FR5: Edge case tests for empty results, missing fields, ambiguous questions

### Non-functional Requirements
- All tests use mocked OpenAI (no real API calls)
- Tests follow existing ESM jest patterns (jest.unstable_mockModule)
- Tests are deterministic and run in < 30 seconds

## 5. UX / API Contract
- No API changes; tests validate existing pipeline behavior.

## 6. Data Model Impact
- No data model changes.

## 7. Integration Impact
- No integration changes; tests mock OpenAI at the boundary.

## 8. Code Impact

### Files/modules likely to change
- None (test-only change)

### New files/modules
- `backend/tests/unit/ai/aiTestSuite.test.ts` — 50+ unit test cases for AI pipeline
- `backend/tests/integration/aiTestSuite.test.ts` — Integration test cases for full pipeline chain

## 9. Test Plan

### Unit Tests
- 50+ question→SQL→validation test cases covering:
  - Revenue: total, period, comparison, breakdown, AOV, weekly
  - Product: top sellers, category perf, stock, out of stock, period sales
  - Customer: new vs returning, top spenders, frequent buyers, LTV, new by period
  - Order: count, status breakdown, payment methods, recent, pending, refund rate
  - Edge cases: empty question, long question, ambiguous questions, no results
  - Security: SQL injection, forbidden keywords, UNION, no store_id, dangerous functions

### Integration Tests
- Full pipeline chain: question → system prompt → mock OpenAI → SQL validation → execution mock → chart config → response
- Cross-category: mixed queries testing the complete chatService.ask() flow

## 10. Rollout Plan
- No rollout needed; test-only change.

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [x] Tests added/updated
- [x] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
