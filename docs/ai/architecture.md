# Architecture — AI Context Map

## System Overview

Woo AI Analytics is a **hybrid Plugin + SaaS** product:
- **WordPress Plugin** (lightweight): Syncs WooCommerce data, renders chat UI in WP admin
- **SaaS Backend** (cloud): Processes AI queries, generates charts, stores dashboards

## Data Flow

```
Store Owner → WP Admin Chat UI → Plugin AJAX → SaaS Backend API
                                                    ↓
                                              AI Pipeline
                                         (OpenAI GPT-4o API)
                                                    ↓
                                           PostgreSQL Query
                                                    ↓
                                         Chart Rendering
                                                    ↓
                                    Response (text + chart + data)
                                                    ↓
                                       WP Admin Chat UI renders
```

## Component Responsibilities

### Plugin (`plugin/`)
- **Data Sync Agent**: Reads WooCommerce data (orders, products, customers) and sends to SaaS
- **Admin UI**: React chat interface, settings page, dashboard view
- **Auth**: Generates API key on connection, sends with every request
- **AJAX Handler**: Proxies chat requests from browser to SaaS backend (with nonce verification)

### SaaS Backend (`backend/`)
- **API Layer** (`src/routes/`): REST endpoints for sync, chat, auth, dashboards
- **Auth Middleware** (`src/middleware/`): Validates API key + store_id on every request
- **AI Pipeline** (`ai/`): NL→SQL conversion, query validation, response generation
- **Chart Engine** (`charts/`): Server-side chart rendering via Chart.js + chartjs-node-canvas
- **Job Queue** (BullMQ): Background jobs for data sync, report generation, scheduled insights
- **Database** (PostgreSQL): Analytics-optimized store of synced WooCommerce data
- **Read-only DB** (`src/db/readonlyConnection.ts`): Separate Knex pool using `woo_ai_readonly` PostgreSQL user for AI query execution (SELECT-only, 5s timeout)

### AI Pipeline (`backend/ai/`)
- **System Prompt**: Injects store's data schema (tables, columns, date ranges)
- **NL→SQL**: Converts natural language question to validated SQL query
- **Query Validator**: Ensures SELECT-only, has store_id, timeout enforced
- **Query Executor**: Runs validated SQL via read-only DB, returns rows + rowCount + durationMs
- **Chart Spec Generator**: Determines chart type and config from query results
- **Response Assembler**: Combines text answer + chart + raw data table

## Key Design Decisions
1. **Why hybrid (not pure plugin)?** WP sites are slow; offloading AI processing to SaaS keeps stores fast
2. **Why PostgreSQL (not WP database)?** Analytical queries need indexes, window functions, CTEs — not available via WordPress
3. **Why OpenAI (not local models)?** GPT-4o accuracy on NL→SQL is critical; local models can't match it yet
4. **Why server-side chart rendering?** Consistent output, works in emails/PDFs, reduces client-side JS
