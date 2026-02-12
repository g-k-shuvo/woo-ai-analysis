# Task Tracker — Woo AI Analytics

## Phase 1: MVP (Month 1–3)

### Sprint 1: Foundation (Week 1–2)
- [x] **1.1** Backend scaffold — Fastify + TypeScript + ESLint + Prettier + Jest
- [x] **1.2** Docker Compose — PostgreSQL 16 + Redis 7 for local dev
- [x] **1.3** Database migrations — All core tables (stores, orders, order_items, products, customers, categories, coupons, sync_logs)
- [x] **1.4** Health check endpoint — GET /health
- [x] **1.5** WordPress plugin scaffold — Main file, activation hooks, admin menu
- [x] **1.6** Plugin settings page — React-based, API URL field, Connect button
- [x] **1.7** @wordpress/scripts build pipeline — Webpack + React admin UI

### Sprint 2: Connection & Sync (Week 3–4)
- [x] **2.1** Store connection flow — Plugin generates API key → handshakes with SaaS
- [x] **2.2** Auth middleware — API key validation on all backend routes
- [x] **2.3** Initial full sync — Orders batch read + send to backend
- [x] **2.4** Initial full sync — Products + Customers + Categories
- [x] **2.5** Incremental sync — WooCommerce webhook registration + handlers
- [x] **2.6** Sync status API — Progress tracking + WP admin progress bar
- [x] **2.7** Sync error handling — Retry logic, error logging, fallback cron

### Sprint 3: AI Core (Week 5–8)
- [x] **3.1** AI system prompt — Schema injection + few-shot examples
- [x] **3.2** NL→SQL pipeline — Question → OpenAI → SQL → validation
- [x] **3.3** SQL validator — SELECT-only check, store_id check, timeout
- [x] **3.4** Read-only DB user — PostgreSQL user with SELECT-only permissions
- [x] **3.5** Query execution — Run validated SQL, return results
- [x] **3.6** Revenue queries — Total, by period, comparisons
- [x] **3.7** Product queries — Top sellers, category performance
- [x] **3.8** Customer queries — New vs returning, top spenders
- [x] **3.9** Order queries — Count, AOV, status breakdown
- [x] **3.10** Chart spec generation — AI outputs chart type + config

### Sprint 4: Chat UI & Charts (Week 9–10)
- [x] **4.1** Chat UI component — React message thread in WP admin
- [x] **4.2** Chat input — Message box + send + suggested questions
- [x] **4.3** AJAX handler — Plugin proxies chat requests (with nonce)
- [x] **4.4** Chart.js integration — Client-side interactive charts
- [x] **4.5** Server-side chart rendering — chartjs-node-canvas → PNG
- [x] **4.6** Chart types — Bar, line, pie, doughnut, table view

### Sprint 5: Polish & Launch (Week 11–12)
- [x] **5.1** Onboarding wizard — Install → Connect → Sync → First question
- [x] **5.2** Error handling — Graceful AI failures, sync errors, rate limits
- [x] **5.3** AI test suite — 50+ question→answer test cases
- [x] **5.4** Backend tests — Jest unit + integration tests
- [x] **5.5** Plugin tests — PHPUnit tests
- [x] **5.6** WordPress.org compliance — readme.txt, screenshots, i18n
- [ ] **5.7** Landing page
- [ ] **5.8** Submit to WordPress.org

## Phase 2: Enhanced (Month 4–6)
- [ ] **6.1** Save chart / pin to dashboard
- [ ] **6.2** Custom dashboard with drag-and-drop layout
- [ ] **6.3** PDF report export
- [ ] **6.4** CSV export
- [ ] **6.5** Scheduled insights (daily/weekly email)
- [ ] **6.6** Predictive analytics (revenue forecast)
- [ ] **6.7** Date range comparison (this month vs last month)
