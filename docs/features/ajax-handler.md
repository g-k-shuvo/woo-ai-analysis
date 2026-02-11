# Feature: AJAX Handler — Plugin Proxies Chat Requests with Nonce

**Slug:** ajax-handler
**Status:** In Progress
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- The WordPress plugin acts as a secure proxy between the React admin UI and the SaaS backend.
- All chat requests go through `admin-ajax.php` with nonce verification, ensuring CSRF protection.
- The AJAX handler validates user permissions, sanitizes inputs, and forwards authenticated requests to the SaaS backend.
- Success metric: All AJAX handlers have full PHPUnit test coverage (90%+) verifying nonce checks, permission checks, input sanitization, backend proxying, and error handling.

## 2. Scope

### In scope
- PHPUnit test infrastructure for the WordPress plugin (bootstrap, config, base test class)
- Comprehensive unit tests for `Ajax_Handler` class (`handle_chat_query`, `handle_chat_suggestions`)
- Comprehensive unit tests for `Settings` class (all 5 AJAX handlers)
- Tests cover: nonce verification, capability checks, input sanitization, backend HTTP calls, error handling, response formatting

### Out of scope
- Integration tests requiring a live WordPress installation
- E2E tests (Playwright) — deferred to Sprint 5
- Changes to existing PHP code (already implemented)
- React/JS test coverage for useChat/ChatInput (covered by Jest in tasks 4.1-4.2)

## 3. User Stories
- As a developer, I want PHPUnit tests for all AJAX handlers so that regressions are caught automatically.
- As a store owner, I want my chat requests to be protected by nonce verification so that CSRF attacks are prevented.
- As a store owner, I want only WooCommerce managers to access chat so unauthorized users cannot query my data.

## 4. Requirements

### Functional Requirements
- FR1: `waa_chat_query` action — verifies nonce, checks `manage_woocommerce` capability, sanitizes question, proxies to POST `/api/chat/query`, returns response data
- FR2: `waa_chat_suggestions` action — verifies nonce, checks capability, proxies to GET `/api/chat/suggestions`, sanitizes each suggestion string
- FR3: Both handlers return `wp_send_json_error` with message when store is not connected (empty API URL or auth token)
- FR4: Both handlers return `wp_send_json_error` when backend returns non-200 or non-success response
- FR5: Both handlers return `wp_send_json_error` when `wp_remote_post/get` returns a `WP_Error`

### Non-functional Requirements
- Security: Nonce verification on every request, capability check, input sanitization
- Reliability: Graceful error handling for network failures, backend errors
- Test coverage: 90%+ for all AJAX handler classes

## 5. UX / API Contract

### WordPress AJAX Endpoints
```
POST admin-ajax.php
  action=waa_chat_query
  nonce=<wp_nonce>
  question=<user_question>

Response (success): { success: true, data: { answer, sql, rows, rowCount, durationMs, chartSpec, chartConfig } }
Response (error): { success: false, data: { message: "..." } }

POST admin-ajax.php
  action=waa_chat_suggestions
  nonce=<wp_nonce>

Response (success): { success: true, data: { suggestions: ["..."] } }
Response (error): { success: false, data: { message: "..." } }
```

## 6. Data Model Impact
- No new tables or migrations
- Uses existing `wp_options`: `waa_api_url`, `waa_store_api_key`, `waa_connected`

## 7. Integration Impact
- WooCommerce hooks: None
- External APIs: SaaS backend (POST /api/chat/query, GET /api/chat/suggestions)
- Auth: Bearer token from `Settings::get_auth_token()`

## 8. Code Impact

### Files/modules likely to change
- None (AJAX handler already implemented)

### New files/modules
- `plugin/phpunit.xml.dist` — PHPUnit configuration
- `plugin/tests/bootstrap.php` — Test bootstrap (WordPress function stubs)
- `plugin/tests/Unit/AjaxHandlerTest.php` — Tests for Ajax_Handler
- `plugin/tests/Unit/SettingsTest.php` — Tests for Settings

## 9. Test Plan

### Unit Tests (Ajax_Handler)
- Nonce verification is called with correct parameters
- Permission denied returned for users without `manage_woocommerce`
- Empty question returns error
- Store not connected returns error (empty API URL)
- Store not connected returns error (empty auth token)
- Successful query proxies to backend and returns data
- WP_Error from backend returns error
- Non-200 status code returns error
- Backend error message is sanitized and forwarded
- Suggestions endpoint verifies nonce and permission
- Suggestions are sanitized before returning

### Unit Tests (Settings)
- save_settings: validates API URL, saves option
- test_connection: calls backend /health, updates connected status
- connect: generates API key, POSTs to backend, encrypts and stores key
- disconnect: notifies backend, clears local options
- sync_status: proxies to backend /api/sync/status
- get_auth_token: builds correct base64 token
- All handlers verify nonce and capability

### Regression Risks
- None (adding tests only, no code changes)

## 10. Rollout Plan
- No feature flag needed
- No migration needed
- Tests only — zero production impact

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
