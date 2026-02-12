# Feature: Onboarding Wizard

**Slug:** onboarding-wizard
**Status:** In Progress
**Owner:** Plugin + Backend
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Guide new store owners through the Install → Connect → Sync → First Question flow
- Reduce drop-off by providing a step-by-step wizard on first visit
- Show real-time sync progress and let users ask their first AI question

### Acceptance Criteria
- New installs see a 4-step wizard: Welcome → Connect → Sync → Ask
- Wizard state persists via `waa_onboarding_completed` WP option
- Each step validates completion before allowing progress
- Backend provides `GET /api/stores/onboarding-status` to check readiness
- Wizard can be dismissed/skipped and accessed again from settings
- Completing the wizard marks onboarding as done

## 2. Scope

### In scope
- 4-step wizard UI component (Welcome, Connect, Sync, Ask)
- `useOnboarding` React hook for wizard state management
- Backend `GET /api/stores/onboarding-status` endpoint
- PHP `Onboarding` class for option tracking + AJAX handlers
- `waa_onboarding_completed` and `waa_onboarding_dismissed` WP options
- App.jsx routing: show wizard when onboarding incomplete
- Admin_UI: pass onboarding state to frontend via `waaData`
- Unit + integration tests

### Out of scope
- Animated transitions between steps
- Analytics tracking of wizard funnel
- Email welcome sequence

## 3. User Stories
- As a new store owner, I want a guided setup wizard so I can connect and start using AI analytics quickly
- As a store owner who skipped onboarding, I want to access the wizard again from settings
- As a returning store owner who completed onboarding, I want to go directly to the chat

## 4. Requirements

### Functional Requirements
- FR1: Wizard has 4 steps — Welcome, Connect, Sync, Ask First Question
- FR2: Welcome step shows feature overview and "Get Started" button
- FR3: Connect step reuses existing connection flow (API URL + Connect Store)
- FR4: Sync step shows sync progress (reuses SyncStatus component) and auto-advances when sync completes
- FR5: Ask step provides a sample question and shows the AI response
- FR6: Backend `GET /api/stores/onboarding-status` returns `{ connected, hasSyncedData, recordCounts }`
- FR7: Completing all steps sets `waa_onboarding_completed = true`
- FR8: Wizard can be dismissed, setting `waa_onboarding_dismissed = true`
- FR9: App.jsx shows wizard when `onboardingComplete` is false and page is the main chat page
- FR10: PHP AJAX handler `waa_complete_onboarding` marks onboarding as done
- FR11: PHP AJAX handler `waa_dismiss_onboarding` marks onboarding as dismissed

### Non-functional Requirements
- Performance: Wizard renders instantly, no extra API calls until needed
- Security: All AJAX handlers require nonce + `manage_woocommerce` capability
- Accessibility: Steps use semantic HTML, focus management between steps

## 5. UX / API Contract

### Wizard Steps Flow
```
Step 1: Welcome → Step 2: Connect → Step 3: Sync → Step 4: Ask
```

### GET /api/stores/onboarding-status (Auth required)
```json
// Response 200
{
  "success": true,
  "data": {
    "connected": true,
    "hasSyncedData": true,
    "recordCounts": {
      "orders": 150,
      "products": 45,
      "customers": 80,
      "categories": 12
    }
  }
}
```

### AJAX: waa_complete_onboarding
- Nonce: `waa_nonce`
- Capability: `manage_woocommerce`
- Sets `waa_onboarding_completed = true`

### AJAX: waa_dismiss_onboarding
- Nonce: `waa_nonce`
- Capability: `manage_woocommerce`
- Sets `waa_onboarding_dismissed = true`

## 6. Data Model Impact
- No new database tables
- New WP options: `waa_onboarding_completed` (bool), `waa_onboarding_dismissed` (bool)
- Backend queries existing tables (stores, orders, products, customers, categories) to check readiness

## 7. Integration Impact
- Reuses existing store connection AJAX handlers
- Reuses existing SyncStatus component
- Backend reuses existing sync status query patterns
- No new external API calls

## 8. Code Impact

### Files/modules likely to change
- `plugin/admin/src/App.jsx` — conditional wizard rendering
- `plugin/includes/class-admin-ui.php` — pass onboarding state in `waaData`
- `plugin/includes/class-plugin.php` — load onboarding class
- `plugin/tests/bootstrap.php` — load onboarding class for tests
- `backend/src/index.ts` — register onboarding route
- `backend/src/routes/stores.ts` — add onboarding status endpoint

### New files/modules
- `plugin/admin/src/components/OnboardingWizard.jsx` — wizard UI component
- `plugin/admin/src/hooks/useOnboarding.js` — wizard state hook
- `plugin/includes/class-onboarding.php` — PHP onboarding class
- `plugin/tests/Unit/OnboardingTest.php` — PHPUnit tests
- `backend/tests/unit/routes/onboardingStatus.test.ts` — backend unit tests
- `backend/tests/integration/onboardingStatus.test.ts` — backend integration tests

## 9. Test Plan

### Unit Tests (Backend)
- `GET /api/stores/onboarding-status` returns correct status for new store (no data)
- Returns correct status for store with synced data
- Returns correct record counts

### Unit Tests (PHPUnit)
- Onboarding class registers AJAX actions
- `waa_complete_onboarding` sets option and returns success
- `waa_dismiss_onboarding` sets option and returns success
- Both handlers reject unauthorized users (no capability)
- Both handlers require nonce

### Integration Tests (Backend)
- Authenticated request returns onboarding status
- Unauthenticated request returns 401

## 10. Rollout Plan
- No feature flag needed
- No migration needed
- Backward compatible: wizard only shows for `onboardingComplete = false`

## 11. Checklist
- [ ] Plan reviewed
- [ ] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
