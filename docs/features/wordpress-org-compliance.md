# Feature: WordPress.org Compliance

**Slug:** wordpress-org-compliance
**Status:** In Progress
**Owner:** Engineering
**Created:** 2026-02-12
**Last updated:** 2026-02-12

## 1. Objective
- Ensure the Woo AI Analytics plugin meets all WordPress.org plugin directory submission requirements.
- Covers readme.txt formatting, i18n readiness (POT file), directory listing prevention, clean uninstall, plugin action links, and singleton hardening.
- Acceptance criteria: Plugin passes WordPress.org plugin review checklist with zero issues.

## 2. Scope

### In scope
- readme.txt enhancements (Screenshots, Upgrade Notice, Privacy section)
- index.php silence files in all plugin directories
- uninstall.php completeness (all options cleaned)
- POT translation template file
- Plugin action links (Settings link on plugins list page)
- Singleton __wakeup() methods on all singleton classes
- PHPUnit tests for all new/changed behavior

### Out of scope
- Actual screenshots (placeholder descriptions only)
- Landing page (task 5.7)
- WordPress.org submission (task 5.8)

## 3. User Stories
- As a WordPress.org reviewer, I want all directories to have index.php files so directory listing is prevented.
- As a store owner, I want a "Settings" link on the Plugins page so I can quickly access configuration.
- As a translator, I want a POT file so I can localize the plugin.
- As a store owner uninstalling, I want all plugin data removed cleanly.

## 4. Requirements

### Functional Requirements
- FR1: readme.txt includes Screenshots, Upgrade Notice, and privacy disclosure sections
- FR2: All plugin directories contain index.php with `<?php // Silence is golden.`
- FR3: uninstall.php removes ALL plugin options (including onboarding state)
- FR4: POT file generated in languages/ directory
- FR5: "Settings" link appears on the Plugins page next to Activate/Deactivate
- FR6: All singleton classes have public __wakeup() throwing RuntimeException

### Non-functional Requirements
- Security: No new external requests, all changes are local-only
- Compatibility: No changes to existing behavior, purely additive

## 5. UX / API Contract
- Plugin action link: "Settings" → admin.php?page=woo-ai-analytics-settings
- No API changes

## 6. Data Model Impact
- No database changes
- No new tables or fields

## 7. Integration Impact
- None

## 8. Code Impact

### Files/modules likely to change
- `plugin/uninstall.php` — add missing option deletions
- `plugin/readme.txt` — add Screenshots, Upgrade Notice, Privacy sections
- `plugin/woo-ai-analytics.php` — add plugin action links filter
- `plugin/includes/class-plugin.php` — add __wakeup()
- `plugin/includes/class-admin-ui.php` — add __wakeup()
- `plugin/includes/class-settings.php` — add __wakeup()
- `plugin/includes/class-onboarding.php` — add __wakeup()
- `plugin/includes/class-webhooks.php` — add __wakeup()
- `plugin/tests/bootstrap.php` — add stubs for new WP functions

### New files/modules
- `plugin/index.php` — silence file
- `plugin/includes/index.php` — silence file
- `plugin/assets/index.php` — silence file
- `plugin/assets/js/index.php` — silence file
- `plugin/languages/index.php` — silence file
- `plugin/languages/woo-ai-analytics.pot` — translation template
- `plugin/tests/Unit/ComplianceTest.php` — tests for compliance features

## 9. Test Plan

### Unit Tests
- Verify uninstall.php deletes all 7 options
- Verify plugin action links filter returns Settings link
- Verify all singleton __wakeup() methods throw RuntimeException
- Verify index.php files exist in all directories

### Integration Tests
- N/A (no API or DB changes)

### Regression Risks
- Minimal — changes are purely additive

## 10. Rollout Plan
- Feature flag? No
- No migration needed
- Fully backward compatible
- Deploy as part of v1.0.0 release

## 11. Checklist
- [ ] Plan reviewed
- [ ] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated (docs/ai/, agent_docs/)
- [ ] PR raised
- [ ] PR reviewed and approved
- [ ] Merged
