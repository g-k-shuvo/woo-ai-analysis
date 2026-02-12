# Feature: Graceful Error Handling

**Slug:** error-handling
**Status:** Done
**Owner:** Backend + Plugin
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- AI queries can fail due to OpenAI API outages, rate limits, timeouts, or invalid responses. Currently errors bubble up as raw technical messages.
- Add rate limiting per store, OpenAI retry with exponential backoff, user-friendly error messages, and a retry button in the Chat UI.
- **Success criteria:** Rate-limited stores get 429 with `retryAfter`; OpenAI transient failures are retried up to 3 times; frontend shows retry button on errors.

## 2. Scope

### In scope
- Redis-backed per-store rate limiting middleware (chat queries)
- OpenAI API retry logic with exponential backoff (429/5xx/timeout)
- Enhanced error handler with `retryAfter` header for 429 responses
- User-friendly error messages for all AI failure modes
- Frontend retry button on error messages
- Rate limit configuration in backend config

### Out of scope
- Circuit breaker pattern (deferred to Phase 2)
- Error dashboard in WP admin (separate feature)
- IP-based rate limiting (handled by infrastructure/CDN)
- Auth attempt throttling (separate feature)

## 3. User Stories
- As a store owner, I want failed AI queries to retry automatically so transient issues don't break my experience.
- As a store owner, I want clear error messages when something goes wrong, not technical jargon.
- As a store owner, I want a retry button so I can re-ask a failed question without retyping.
- As a platform operator, I want per-store rate limits to prevent abuse.

## 4. Requirements

### Functional Requirements
- FR1: Rate limiter middleware — per-store sliding window, 20 requests/minute for chat queries
- FR2: RateLimitError response includes `retryAfter` seconds in body and `Retry-After` header
- FR3: OpenAI calls retry up to 3 times on 429/5xx/timeout with exponential backoff (1s, 2s, 4s)
- FR4: User-friendly error messages mapped from error codes (AI_ERROR → "Our AI service is temporarily unavailable", RATE_LIMIT_ERROR → "You've sent too many questions", etc.)
- FR5: Frontend retry button on error messages that re-sends the last user question
- FR6: Rate limit config values (max requests, window) in AppConfig

### Non-functional Requirements
- Rate limit state stored in Redis (survives process restarts)
- Rate limit middleware adds < 5ms latency per request
- All DB queries include `WHERE store_id = ?`

## 5. UX / API Contract

### Rate limit error response (429)
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_ERROR",
    "message": "You've sent too many questions. Please wait a moment.",
    "retryAfter": 15
  }
}
```
Response header: `Retry-After: 15`

### AI error response (502)
```json
{
  "success": false,
  "error": {
    "code": "AI_ERROR",
    "message": "Our AI service is temporarily unavailable. Please try again in a moment."
  }
}
```

## 6. Data Model Impact
- No new tables or columns needed
- Rate limit state stored in Redis keys: `ratelimit:{storeId}:chat`

## 7. Integration Impact
- OpenAI API: retry logic on 429/5xx/timeout
- Redis: used for rate limit counters
- No WooCommerce hooks affected

## 8. Code Impact

### Files/modules likely to change
- `backend/src/config.ts` — add rateLimit config
- `backend/src/utils/errors.ts` — add retryAfter to RateLimitError
- `backend/src/middleware/errorHandler.ts` — handle retryAfter header
- `backend/src/ai/pipeline.ts` — add OpenAI retry logic
- `backend/src/routes/chat/query.ts` — add rate limiter hook
- `plugin/admin/src/hooks/useChat.js` — store failed question for retry
- `plugin/admin/src/components/ChatMessage.jsx` — retry button

### New files/modules
- `backend/src/middleware/rateLimiter.ts` — Redis-backed per-store rate limiter
- `backend/tests/unit/middleware/rateLimiter.test.ts`
- `backend/tests/unit/ai/pipelineRetry.test.ts`
- `backend/tests/integration/rateLimiter.test.ts`

## 9. Test Plan

### Unit Tests
- `rateLimiter.test.ts`: allows requests under limit, rejects at limit, returns retryAfter, resets after window, uses correct Redis key, handles Redis errors gracefully
- `pipelineRetry.test.ts`: retries on 429, retries on 5xx, retries on timeout, succeeds after transient failure, gives up after max retries, does not retry on 4xx (non-429), exponential backoff timing
- Error handler: RateLimitError sets Retry-After header

### Integration Tests
- `rateLimiter.test.ts`: POST /api/chat/query rate limited after N requests, returns 429 with retryAfter, Retry-After header present

## 10. Rollout Plan
- Feature flag: no
- No migration needed
- Backward compatible: yes (new middleware, existing routes unchanged)

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [x] Tests added/updated
- [x] Lint/test/build pass
- [x] Docs updated
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
