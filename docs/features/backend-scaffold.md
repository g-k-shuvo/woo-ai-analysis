# Feature: Backend API Scaffold

**Slug:** backend-scaffold
**Status:** Planned
**Owner:** Backend
**Created:** 2026-02-06
**Last updated:** 2026-02-06

## 1. Objective
- Set up the SaaS backend project with all foundational infrastructure
- Success: `npm run dev` starts the API server, connects to PostgreSQL and Redis, and responds to health checks

## 2. Scope

### In scope
- Fastify API server with TypeScript
- Docker Compose for PostgreSQL 16 + Redis 7
- Knex.js migrations for all core database tables
- Health check endpoint
- Error handling middleware
- Structured logging (Pino)
- ESLint + Prettier configuration
- Jest test setup

### Out of scope
- Authentication middleware (separate feature)
- AI pipeline (separate feature)
- Deployment/hosting setup (Phase 2)

## 3. User Stories
- As a developer, I want to run `docker-compose up -d && npm run dev` and have a working API server so I can start building features

## 4. Requirements

### Functional Requirements
- FR1: Fastify server starts on port 3000 (configurable via env)
- FR2: Docker Compose starts PostgreSQL 16 on port 5432 and Redis 7 on port 6379
- FR3: Knex migrations create all core tables (stores, orders, order_items, products, customers, categories, coupons, saved_charts, conversations, sync_logs)
- FR4: GET /health returns `{ status: "ok", version, uptime, db: "connected", redis: "connected" }`
- FR5: All errors return standard JSON format: `{ success: false, error: { code, message } }`

### Non-functional Requirements
- Performance: Server starts in < 3 seconds
- Security: No secrets in code (use .env file, which is gitignored)
- Reliability: Graceful shutdown on SIGTERM
- Observability: Structured JSON logs with request ID

## 5. API Contract
- `GET /health` → `{ status: "ok", version: "1.0.0", uptime: 123, db: "connected", redis: "connected" }`

## 6. Data Model Impact
- New tables: stores, orders, order_items, products, customers, categories, coupons, saved_charts, conversations, sync_logs
- See `docs/ai/datamodel.md` for full schema
- All tables include `store_id` for tenant isolation

## 7. Integration Impact
- PostgreSQL 16 (local Docker, managed DB in production)
- Redis 7 (local Docker, managed Redis in production)
- No external APIs yet

## 8. Code Impact

### New files/modules
- `backend/package.json`
- `backend/tsconfig.json`
- `backend/.eslintrc.js`
- `backend/.prettierrc`
- `backend/docker-compose.yml`
- `backend/src/index.ts` — Server entry point
- `backend/src/config.ts` — Environment config
- `backend/src/routes/health.ts` — Health check
- `backend/src/middleware/errorHandler.ts`
- `backend/src/utils/errors.ts` — Custom error classes
- `backend/src/utils/logger.ts` — Pino logger
- `backend/db/knexfile.ts`
- `backend/db/migrations/` — All table migrations
- `backend/tests/health.test.ts`
- `backend/.env.example`

## 9. Test Plan

### Unit Tests
- Config loader reads env variables correctly
- Error classes produce correct status codes and JSON
- Logger produces structured JSON output

### Integration Tests
- Server starts and responds to health check
- Database connection established
- Redis connection established
- Migrations run successfully
- Graceful shutdown works

### Regression Risks
- None (first feature, no existing code)

## 10. Rollout Plan
- Feature flag: No
- Migration: First migration, no backward compatibility needed
- Deployment: Local development only at this stage

## 11. Checklist
- [ ] Plan reviewed
- [ ] Feature spec approved
- [ ] Tests added/updated
- [ ] Lint/test/build pass
- [ ] Docs updated
- [ ] PR raised
- [ ] PR approved
- [ ] Merged
