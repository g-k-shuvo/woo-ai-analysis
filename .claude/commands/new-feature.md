# Create New Feature Spec

Create a new feature specification for: **$ARGUMENTS**

## Steps

1. **Read Template**: Read `docs/features/_template.md` for the standard format
2. **Analyze Codebase**: Explore relevant parts of the codebase to understand current state
3. **Read Context Maps**: Read relevant `docs/ai/` files for architectural context
4. **Create Feature Spec**: Create `docs/features/<feature-slug>.md` with:
   - Clear objective and success criteria
   - Detailed scope (in scope / out of scope)
   - User stories
   - Functional and non-functional requirements
   - API contract or UX flows
   - Data model impact (new tables, migrations, tenant isolation rules)
   - Integration impact (WooCommerce hooks, OpenAI API, webhooks)
   - Code impact (files to change, new files)
   - Test plan (unit, integration, E2E, regression risks)
   - Rollout plan (feature flags, migrations, backward compatibility)
5. **Create Task Tracker**: Create `task-tracker.md` in the project root with checkboxes for each implementation step
6. **Update Feature Index**: Add the new feature to `docs/features/README.md`

## Output
- Feature spec at `docs/features/<slug>.md`
- Updated `task-tracker.md`
- Updated `docs/features/README.md`

Present the spec for review. Wait for approval before any implementation.
