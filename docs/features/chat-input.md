# Feature: Chat Input

**Slug:** chat-input
**Status:** In Progress
**Owner:** Developer
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Extract the chat input area into a dedicated ChatInput component with message box, send button, and suggested questions.
- Provide context-aware suggested questions to help store owners get started quickly.
- Success metric: Store owner sees clickable suggested question chips when chat is empty, can click one to send it immediately.

## 2. Scope

### In scope
- ChatInput React component (textarea, send button, character count)
- Suggested questions displayed as clickable chips when chat is empty
- Backend GET /api/chat/suggestions endpoint returning suggested questions
- chatService.getSuggestions() method that returns contextual questions
- Unit + integration tests for all new backend code

### Out of scope
- Chart.js rendering in the UI (task 4.4)
- Server-side chart rendering (task 4.5)
- Message persistence / history (future phase)
- AI-powered dynamic suggestions based on store data (future enhancement)

## 3. User Stories
- As a store owner, I want to see suggested questions when I open the chat so I know what to ask.
- As a store owner, I want to click a suggested question to send it immediately without typing.
- As a store owner, I want a clear input area with a send button to type my questions.
- As a store owner, I want keyboard shortcuts (Enter to send, Shift+Enter for new line).

## 4. Requirements

### Functional Requirements
- FR1: ChatInput component renders a textarea with send button
- FR2: Enter sends the message, Shift+Enter creates a new line
- FR3: Send button is disabled when input is empty or loading
- FR4: Suggested questions appear as clickable chips when there are no messages
- FR5: Clicking a suggested question sends it immediately via sendMessage
- FR6: Backend GET /api/chat/suggestions returns an array of suggested question strings
- FR7: chatService.getSuggestions() returns categorized suggested questions (revenue, products, customers, orders)
- FR8: Suggested questions are fetched once on component mount and cached

### Non-functional Requirements
- Performance: Suggestions endpoint responds in < 100ms
- Security: Auth required for suggestions endpoint, tenant isolation
- Reliability: Graceful fallback to default questions if API fails

## 5. UX / API Contract

### Backend API
```
GET /api/chat/suggestions
Authorization: Bearer <token>

Response (success):
{
  "success": true,
  "data": {
    "suggestions": [
      "What was my total revenue this month?",
      "What are my top 5 selling products?",
      "How many new customers this week?",
      "What is my average order value?",
      "Show revenue trend for the last 30 days",
      "Which product categories perform best?"
    ]
  }
}
```

## 6. Data Model Impact
- No new tables required
- No migrations needed

## 7. Integration Impact
- WooCommerce hooks/webhooks: None
- External APIs: None (suggestions are static/contextual)
- Auth: Existing Bearer token auth

## 8. Code Impact

### Files/modules likely to change
- `plugin/admin/src/components/ChatWindow.jsx` — use ChatInput component
- `plugin/admin/src/components/ChatWindow.css` — add suggested questions styles
- `backend/src/services/chatService.ts` — add getSuggestions method
- `backend/src/routes/chat/query.ts` — add GET /api/chat/suggestions route
- `backend/src/index.ts` — register suggestions route (already registered via chat routes)

### New files/modules
- `plugin/admin/src/components/ChatInput.jsx` — extracted input component
- `plugin/admin/src/components/ChatInput.css` — input + suggestions styles
- `backend/tests/unit/services/chatService.test.ts` — unit tests for `getSuggestions` (added to existing file)
- `backend/tests/unit/routes/chatQuery.test.ts` — unit tests for `GET /api/chat/suggestions` route (added to existing file)
- `backend/tests/integration/chatQuery.test.ts` — integration tests for `getSuggestions` (added to existing file)

## 9. Test Plan

### Unit Tests
- chatService.getSuggestions: returns array of strings, includes all categories
- chat/suggestions route: auth requirement, response format, correct data shape

### Integration Tests
- Full flow: GET /api/chat/suggestions → response with suggestions array
- Auth: Unauthenticated requests are rejected

### Regression Risks
- Existing ChatWindow behavior must not break
- Existing chat query tests must still pass

## 10. Rollout Plan
- No feature flag needed
- No migration needed
- Backward compatible

## 11. Checklist
- [ ] Plan reviewed
- [ ] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
