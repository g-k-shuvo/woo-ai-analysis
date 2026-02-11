# Feature: <Human readable name>

**Slug:** <feature-slug>
**Status:** Draft | Planned | In Progress | In Review | Done
**Owner:** <team/role>
**Created:** <YYYY-MM-DD>
**Last updated:** <YYYY-MM-DD>

## 1. Objective
- What problem does this solve?
- Success metric / acceptance criteria

## 2. Scope

### In scope
- …

### Out of scope
- …

## 3. User Stories
- As a [store owner], I want [feature] so that [benefit]...

## 4. Requirements

### Functional Requirements
- FR1: …
- FR2: …

### Non-functional Requirements
- Performance: Response time < 3 seconds for AI queries
- Security: Store data isolation, PII anonymization, SQL sandboxing
- Reliability: Graceful error handling, retry logic for sync
- Observability: Logging, sync health tracking, error reporting

## 5. UX / API Contract
- Screens / flows (if UI change)
- API endpoints (if API change)
- Example requests/responses (high level)

## 6. Data Model Impact
- New/changed tables:
- New fields:
- Migrations needed:
- Backfill required:
- Tenancy rules: All records must include `store_id`

## 7. Integration Impact
- WooCommerce hooks/webhooks affected:
- External APIs (OpenAI, etc.):
- Auth method used:

## 8. Code Impact

### Files/modules likely to change
- `path/to/existing/file`

### New files/modules
- …

## 9. Test Plan

### Unit Tests
- …

### Integration Tests
- …

### E2E Tests (Playwright)
- …

### Regression Risks
- …

## 10. Rollout Plan
- Feature flag? (yes/no)
- Migration strategy
- Backward compatibility
- Deployment notes

## 11. Checklist
- [ ] Plan reviewed
- [ ] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
