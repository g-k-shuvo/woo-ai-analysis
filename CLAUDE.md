# Woo AI Analytics — WooCommerce AI-Powered Conversational Analytics Plugin

## What This Is
A hybrid WordPress plugin + SaaS backend that lets WooCommerce store owners
chat with their store data using natural language. AI generates answers, charts,
and reports from real WooCommerce order/product/customer data.

## Architecture
- **plugin/**: WordPress plugin (PHP 8.0+, React admin UI via @wordpress/scripts)
- **backend/**: SaaS API (Node.js + Fastify + TypeScript, PostgreSQL 16, Redis 7, BullMQ)
- **backend/ai/**: AI query pipeline (OpenAI GPT-4o, NL-to-SQL conversion)
- **docs/features/**: Feature specifications (source of truth for all work)
- **docs/ai/**: AI context maps for codebase navigation

## Key Commands

### Plugin
- Dev server: `cd plugin && npm run start`
- Build: `cd plugin && npm run build`
- Lint: `cd plugin && npm run lint`
- Tests: `cd plugin && composer test`
- Format: `cd plugin && npm run format`

### Backend
- Dev server: `cd backend && npm run dev`
- Build: `cd backend && npm run build`
- Lint: `cd backend && npm run lint`
- Tests: `cd backend && npm test`
- Test (specific): `cd backend && npm run test:unit` or `npm run test:integration`
- DB migrations: `cd backend && npx knex migrate:latest`
- DB seed: `cd backend && npx knex seed:run`
- Docker (PostgreSQL+Redis): `cd backend && docker-compose up -d`

### Full Project
- All tests: `npm run test:all` (from root)
- Lint all: `npm run lint:all` (from root)

## Code Style

### PHP (Plugin)
- WordPress Coding Standards, strict types declared in every file
- PHP 8.0+ features (named arguments, match expressions, union types)
- Use `wp_remote_post`/`wp_remote_get` for HTTP (never cURL directly)
- Sanitize all inputs: `sanitize_text_field()`, `absint()`, `esc_sql()`
- Escape all outputs: `esc_html()`, `esc_attr()`, `esc_url()`
- Nonces on every AJAX request: `wp_verify_nonce()`
- Translation-ready: all strings wrapped in `__()` or `esc_html__()`

### TypeScript (Backend)
- ES modules (import/export), never CommonJS (require)
- Strict TypeScript (`strict: true` in tsconfig)
- Prettier + ESLint enforced
- Async/await (never raw callbacks)
- Parameterized SQL queries — NEVER string concatenation
- Wrap errors with context: `throw new AppError('context', { cause: err })`

### React (Admin UI)
- Functional components + hooks only (no class components)
- Use @wordpress/scripts build pipeline
- Tailwind or WP admin native styles (no custom CSS frameworks)
- State: React hooks (useState, useReducer) — no Redux

### SQL
- Always parameterized queries with `?` placeholders
- Every query MUST include `WHERE store_id = ?` for tenant isolation
- AI-generated SQL: SELECT-only, read-only DB user, 5-second timeout
- Use Knex.js query builder where possible

## Detailed Docs (read when relevant)
- Architecture deep-dive: `docs/ai/architecture.md`
- Code structure map: `docs/ai/codestructure.md`
- Database schema & data models: `docs/ai/datamodel.md`
- API endpoints reference: `docs/ai/api-endpoints.md`
- Integrations (WooCommerce, OpenAI): `docs/ai/integrations.md`
- Utilities & helpers: `docs/ai/utilities.md`
- Technical debt tracker: `docs/ai/technical-debt.md`
- AI pipeline design: `agent_docs/ai_pipeline.md`
- WooCommerce data sync: `agent_docs/data_sync.md`
- Security requirements: `agent_docs/security.md`
- WP plugin submission standards: `agent_docs/wp_plugin_standards.md`

## Critical Rules
1. AI-generated SQL must be SELECT-only. Always use read-only DB user.
2. Never send raw customer PII (emails, names, addresses) to external AI APIs. Anonymize first.
3. All WP admin AJAX requests must use nonces.
4. Every DB query must include `WHERE store_id = ?` for data isolation.
5. Use WC REST API v3 (not legacy). Must be HPOS-compatible.
6. Never read `.env` files or secrets — they are denied in settings.json.
7. All timestamps must be UTC.
8. Return empty arrays instead of null for list operations.
9. Test coverage target: 90%.

---

## Feature-first workflow (mandatory)

**Documentation First:** Every change must be tied to a Feature Spec located at `docs/features/<feature-slug>.md`.

**Planning:** The Planning phase must involve creating or updating the Feature Spec (defining objective, scope, impacted files, data model, test plan, and rollout). Use Plan Mode (Shift+Tab twice) for all planning.

**Execution:** Code generation and test creation must explicitly reference requirements defined in the Feature Spec.

**Branching Strategy:** Use the naming convention `feature/<short_meaningful_name>`.

**Git Operations:** Use the `gh` CLI for all GitHub operations (PR creation, comments, status checks).

**Testing:** Every feature must include:
- Unit tests (Jest for backend, PHPUnit for plugin)
- Integration tests
- Playwright E2E tests where applicable
- Target 90% coverage

**PR Flow:**
1. Create/update the feature spec in `docs/features/`
2. Create a `task-tracker.md` with `[ ]` checkboxes for the feature
3. Create a new branch: `feature/<name>`
4. Implement with tests
5. Raise PR via `gh pr create`
6. Run `/review-and-fix` for automated review
7. Address all comments (zero unaddressed feedback)
8. Merge via squash
