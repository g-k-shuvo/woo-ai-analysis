# Feature: Landing Page

**Slug:** landing-page
**Status:** Done
**Owner:** Dev
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Provide a public-facing HTML landing page at the SaaS backend root URL (`GET /`)
- When a user or browser hits the backend URL directly, they see a professional product page instead of a 404/JSON error
- Success criteria: `GET /` returns HTML with 200 status, contains product info, features, CTA

## 2. Scope

### In scope
- `GET /` route returning server-rendered HTML
- Product description, key features, CTA (install plugin / documentation link)
- `GET /api/info` JSON endpoint returning version, status, and docs link
- Responsive design (mobile-friendly)
- Unit tests for both routes
- Integration tests

### Out of scope
- User authentication / signup
- Dynamic content from database
- Separate frontend framework (Next.js, etc.)
- Blog or CMS functionality

## 3. User Stories
- As a visitor, I want to see what the product does when I visit the backend URL
- As a developer, I want a `/api/info` endpoint to check the API version and status programmatically

## 4. Requirements

### Functional Requirements
- FR1: `GET /` returns HTML (content-type: text/html) with 200 status
- FR2: HTML includes product name, description, feature highlights, and CTA
- FR3: `GET /api/info` returns JSON with `{ name, version, description, status, documentation }`
- FR4: Both routes are public (no auth required)
- FR5: HTML is self-contained (inline CSS, no external dependencies)

### Non-functional Requirements
- Performance: Responds in < 50ms (static content, no DB queries)
- Security: No user input, no dynamic data, no injection vectors
- Accessibility: Semantic HTML, proper heading hierarchy

## 5. UX / API Contract

### GET /
Returns self-contained HTML landing page.

### GET /api/info
```json
{
  "name": "Woo AI Analytics",
  "version": "1.0.0",
  "description": "AI-powered conversational analytics for WooCommerce",
  "status": "running",
  "documentation": "https://github.com/user/woo-ai-analytics"
}
```

## 6. Data Model Impact
- No database changes
- No migrations needed

## 7. Integration Impact
- No external API calls
- Auth middleware already skips non-`/api/` routes (landing page is exempt)
- `/api/info` needs to be added to auth skip list

## 8. Code Impact

### Files/modules likely to change
- `backend/src/index.ts` — register new route plugin

### New files/modules
- `backend/src/routes/landing.ts` — GET / and GET /api/info route handlers
- `backend/tests/unit/routes/landing.test.ts` — unit tests
- `backend/tests/integration/landing.test.ts` — integration tests

## 9. Test Plan

### Unit Tests
- GET / returns 200 with content-type text/html
- GET / response contains product name "Woo AI Analytics"
- GET / response contains key feature keywords
- GET / response contains proper HTML structure (doctype, head, body)
- GET / response contains meta viewport for mobile
- GET /api/info returns 200 with JSON
- GET /api/info contains correct name, version, status fields
- GET /api/info has content-type application/json

### Integration Tests
- Landing page is accessible without auth
- /api/info is accessible without auth
- Landing page returns valid HTML structure
- /api/info returns expected JSON schema

### Regression Risks
- None — new routes only, no changes to existing functionality

## 10. Rollout Plan
- Feature flag: no
- No migration needed
- Fully backward compatible (adds new routes only)
- No deployment notes

## 11. Checklist
- [x] Plan reviewed
- [x] Feature spec approved
- [x] Tests added/updated
- [x] Lint/test/build pass
- [x] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
