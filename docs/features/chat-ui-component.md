# Feature: Chat UI Component

**Slug:** chat-ui-component
**Status:** In Progress
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Build the React chat message thread in the WP admin panel, enabling store owners to ask natural language questions about their WooCommerce data.
- Wire up the full end-to-end flow: React → PHP AJAX → SaaS backend → AI pipeline → response.
- Success metric: Store owner can type a question, see a loading state, and receive a text answer with optional chart data.

## 2. Scope

### In scope
- ChatWindow React component (message thread with user/assistant messages)
- useChat custom hook (state management for messages, loading, errors)
- PHP AJAX handler (`waa_chat_query`) that proxies to backend
- Backend `POST /api/chat/query` route that orchestrates the AI pipeline
- Backend `chatService` that wires pipeline → executor → chart spec
- Unit + integration tests for backend chatService and route
- Update App.jsx to render ChatWindow on the main Chat page

### Out of scope
- Chat input box with suggested questions (task 4.2)
- Chart.js rendering in the UI (task 4.4)
- Server-side chart rendering (task 4.5)
- Message persistence / history (future phase)

## 3. User Stories
- As a store owner, I want to see a chat interface on the AI Analytics page so that I can ask questions about my store data.
- As a store owner, I want to see my messages and AI responses in a threaded conversation view.
- As a store owner, I want to see a loading indicator while my question is being processed.
- As a store owner, I want to see error messages if something goes wrong.

## 4. Requirements

### Functional Requirements
- FR1: ChatWindow renders a scrollable message thread with user and assistant messages
- FR2: useChat hook manages messages array, loading state, error state, and sendMessage function
- FR3: PHP AJAX handler validates nonce, checks capability, sanitizes input, proxies to backend
- FR4: Backend POST /api/chat/query accepts { question } body, returns a response object with a `data` property containing `{ answer, sql, rows, rowCount, durationMs, chartSpec, chartConfig }`
- FR5: Backend chatService orchestrates: pipeline.processQuestion → executor.execute → chartSpec.toChartConfig
- FR6: Chat messages include timestamp and sender role (user/assistant/error)

### Non-functional Requirements
- Performance: Chat response < 10 seconds end-to-end (AI processing is the bottleneck)
- Security: Nonce verification, capability check, input sanitization, tenant isolation
- Reliability: Graceful error handling for AI failures, network errors

## 5. UX / API Contract

### Backend API
```
POST /api/chat/query
Authorization: Bearer <token>
Content-Type: application/json

Request:
{ "question": "What was my total revenue last month?" }

Response (success):
{
  "success": true,
  "data": {
    "answer": "Your total revenue last month was $12,345.67",
    "sql": "SELECT SUM(total) AS total_revenue FROM orders WHERE store_id = $1 AND ...",
    "rows": [{ "total_revenue": "12345.67" }],
    "rowCount": 1,
    "durationMs": 45,
    "chartSpec": null,
    "chartConfig": null
  }
}
```

### PHP AJAX
```
POST wp-admin/admin-ajax.php
action: waa_chat_query
nonce: <waa_nonce>
question: "What was my total revenue last month?"
```

## 6. Data Model Impact
- No new tables required
- No migrations needed
- Chat messages are client-side only (no persistence in this task)

## 7. Integration Impact
- WooCommerce hooks/webhooks: None
- External APIs: OpenAI GPT-4o (via existing pipeline)
- Auth: Existing Bearer token auth

## 8. Code Impact

### Files/modules likely to change
- `plugin/admin/src/App.jsx` — render ChatWindow instead of placeholder
- `plugin/includes/class-plugin.php` — load Ajax_Handler
- `backend/src/index.ts` — register chat route

### New files/modules
- `backend/src/services/chatService.ts` — orchestrates AI pipeline + execution + chart
- `backend/src/routes/chat/query.ts` — POST /api/chat/query route
- `plugin/includes/class-ajax-handler.php` — PHP AJAX handler for chat
- `plugin/admin/src/components/ChatWindow.jsx` — React message thread
- `plugin/admin/src/hooks/useChat.js` — chat state management hook
- `plugin/admin/src/components/ChatWindow.css` — chat styling
- `backend/tests/unit/services/chatService.test.ts` — unit tests
- `backend/tests/unit/routes/chatQuery.test.ts` — route unit tests
- `backend/tests/integration/chatQuery.test.ts` — integration tests

## 9. Test Plan

### Unit Tests
- chatService: question processing, error handling, empty results
- chat/query route: input validation, auth requirement, response format
- PHP AJAX handler: nonce check, capability check, input sanitization

### Integration Tests
- Full pipeline: question → chatService → pipeline → executor → response
- Error scenarios: AI failure, timeout, invalid question

### Regression Risks
- Existing AI pipeline tests must still pass
- Settings/sync AJAX handlers must not be affected

## 10. Rollout Plan
- No feature flag needed (new endpoint, no existing behavior changed)
- No migration needed
- Backward compatible (adds new route and UI component)

## 11. Checklist
- [ ] Plan reviewed
- [ ] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
