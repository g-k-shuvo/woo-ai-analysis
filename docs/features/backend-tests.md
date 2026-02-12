# Feature: Backend Tests — Comprehensive Unit + Integration Coverage

**Slug:** backend-tests
**Status:** Done
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Achieve comprehensive test coverage (90%+ target) for all backend modules
- Fill gaps in unit test coverage for route handlers, logger utility, and server initialization
- Ensure all routes have dedicated unit tests (not just integration tests)

## 2. Scope

### In scope
- Unit tests for route handlers: health, stores (connect/status/disconnect), sync/* (orders, products, customers, categories, webhook, status, errors)
- Unit tests for logger utility
- Unit tests for server initialization (index.ts) — verifying wiring only
- All tests follow existing ESM + jest.unstable_mockModule patterns

### Out of scope
- E2E tests (separate task)
- Plugin PHP tests (task 5.5)
- Refactoring source code

## 3. User Stories
- As a developer, I want comprehensive unit tests so that I catch regressions quickly
- As a developer, I want fast unit tests that don't need real infrastructure

## 4. Requirements

### Functional Requirements
- FR1: Every route handler has dedicated unit tests covering happy path, validation, error handling, and HTTP method correctness
- FR2: Logger utility has unit tests covering configuration and serializers
- FR3: All tests pass in CI (`npm test`)
- FR4: Tests follow existing patterns (Fastify inject, ESM mocking, auth simulation)

### Non-functional Requirements
- Performance: Unit tests run in <10 seconds total
- Reliability: No flaky tests (no real DB/Redis/HTTP)

## 5. Test Plan

### Unit Tests (new)
- `tests/unit/routes/health.test.ts` — health route (DB/Redis status, uptime, 200/503)
- `tests/unit/routes/storeConnect.test.ts` — connect/status/disconnect routes
- `tests/unit/routes/syncOrders.test.ts` — orders sync route
- `tests/unit/routes/syncProducts.test.ts` — products sync route
- `tests/unit/routes/syncCustomers.test.ts` — customers sync route
- `tests/unit/routes/syncCategories.test.ts` — categories sync route
- `tests/unit/routes/syncWebhook.test.ts` — webhook route
- `tests/unit/routes/syncStatus.test.ts` — sync status route
- `tests/unit/routes/syncErrors.test.ts` — sync errors + retry route
- `tests/unit/utils/logger.test.ts` — logger utility

## 6. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [x] Tests added/updated
- [x] Lint/test/build pass
- [x] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
