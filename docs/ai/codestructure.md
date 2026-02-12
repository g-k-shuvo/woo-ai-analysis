# Code Structure — AI Context Map

## Repository Layout

```
woo-ai-analytics/
├── CLAUDE.md                    # AI agent instructions (root)
├── .claude/
│   ├── settings.json            # Permissions & security config
│   └── commands/                # Custom slash commands
│       ├── plan.md
│       ├── new-feature.md
│       ├── implement-task.md
│       ├── review-and-fix.md
│       ├── sync-feature.md
│       └── ai-query.md
├── plugin/                      # WordPress plugin
│   ├── woo-ai-analytics.php     # Main plugin file (activation, hooks, menu)
│   ├── includes/
│   │   ├── class-plugin.php           # Core plugin class (singleton)
│   │   ├── class-settings.php         # Settings page & API key management
│   │   ├── class-sync-manager.php     # Data sync engine (full + incremental)
│   │   ├── class-ajax-handler.php     # AJAX endpoints (chat, sync status)
│   │   ├── class-onboarding.php       # Onboarding wizard AJAX handlers [implemented]
│   │   ├── class-webhooks.php          # WooCommerce incremental sync hooks (implemented)
│   │   └── class-admin-ui.php         # Admin page rendering & script enqueue
│   ├── admin/                   # React admin UI source
│   │   ├── src/
│   │   │   ├── App.jsx                # Root component
│   │   │   ├── components/
│   │   │   │   ├── ChatWindow.jsx     # Chat message thread [implemented]
│   │   │   │   ├── ChatInput.jsx      # Message input + send + suggested questions [implemented]
│   │   │   │   ├── ChartRenderer.jsx  # Chart.js interactive chart rendering (bar/line/pie/doughnut) [implemented]
│   │   │   │   ├── TableRenderer.jsx  # Data table rendering from TableResult [implemented]
│   │   │   │   ├── ChatMessage.jsx    # Individual message component with chart type switching [implemented]
│   │   │   │   ├── ChartTypeSelector.jsx # Chart type toolbar (bar/line/pie/doughnut/table) [implemented]
│   │   │   │   ├── Dashboard.jsx      # Saved charts grid + PDF/CSV export buttons [implemented]
│   │   │   │   ├── ExportPdfButton.jsx # PDF report export button [implemented]
│   │   │   │   ├── ExportCsvButton.jsx # CSV export button [implemented]
│   │   │   │   ├── Settings.jsx       # Connection settings page
│   │   │   │   └── OnboardingWizard.jsx  # 4-step onboarding wizard [implemented]
│   │   │   ├── utils/
│   │   │   │   └── convertChartType.js # Client-side chart type converter [implemented]
│   │   │   └── hooks/
│   │   │       ├── useChat.js         # Chat state management
│   │   │       ├── useOnboarding.js   # Onboarding wizard state management [implemented]
│   │   │       └── useSyncStatus.js   # Sync progress polling
│   │   ├── package.json
│   │   └── webpack.config.js          # @wordpress/scripts config
│   ├── assets/                  # Built CSS, images
│   ├── tests/                   # PHPUnit tests
│   │   ├── bootstrap.php              # WP function stubs + WC class stubs
│   │   └── Unit/
│   │       ├── SettingsTest.php        # Settings AJAX + encryption tests (45 tests)
│   │       ├── AjaxHandlerTest.php     # Chat AJAX + XSS prevention tests (59 tests)
│   │       ├── OnboardingTest.php      # Onboarding AJAX + HTTP proxy tests (25 tests)
│   │       ├── PluginTest.php          # Plugin singleton + hook registration tests [implemented]
│   │       ├── AdminUITest.php         # Menu registration + asset enqueue tests [implemented]
│   │       ├── WebhooksTest.php        # Incremental sync + PII protection tests [implemented]
│   │       ├── ReportAjaxTest.php     # PDF report AJAX handler tests [implemented]
│   │       └── CsvExportAjaxTest.php # CSV export AJAX handler tests [implemented]
│   └── composer.json
├── backend/                     # SaaS API server
│   ├── src/
│   │   ├── index.ts                   # Fastify server entry point
│   │   ├── config.ts                  # Environment config loader
│   │   ├── routes/
│   │   │   ├── landing.ts            # GET / (landing page HTML) + GET /api/info (JSON) [implemented]
│   │   │   ├── health.ts             # GET /health
│   │   │   ├── stores.ts             # POST /api/stores/connect, GET /status, DELETE /disconnect
│   │   │   ├── sync/
│   │   │   │   ├── orders.ts         # POST /api/sync/orders
│   │   │   │   ├── products.ts       # POST /api/sync/products
│   │   │   │   ├── customers.ts      # POST /api/sync/customers
│   │   │   │   ├── categories.ts     # POST /api/sync/categories
│   │   │   │   ├── webhook.ts        # POST /api/sync/webhook (incremental sync)
│   │   │   │   └── errors.ts         # GET /api/sync/errors, POST /api/sync/retry/:syncLogId
│   │   │   ├── chat/
│   │   │   │   └── query.ts          # POST /api/chat/query
│   │   │   ├── dashboards/
│   │   │   │   ├── charts.ts         # CRUD for saved charts [implemented]
│   │   │   │   └── layout.ts         # Grid layout update [implemented]
│   │   │   ├── reports/
│   │   │   │   └── index.ts          # PDF report generate, list, download, delete [implemented]
│   │   │   └── exports/
│   │   │       └── csv.ts            # CSV export endpoint [implemented]
│   │   ├── middleware/
│   │   │   ├── auth.ts               # API key validation (Bearer token, bcrypt compare)
│   │   │   ├── errorHandler.ts       # Global error handler + 404
│   │   │   └── rateLimit.ts          # Per-store rate limiting (planned)
│   │   ├── services/
│   │   │   ├── storeService.ts       # Store CRUD, connect/disconnect, API key verify
│   │   │   ├── syncService.ts        # Orders/Products/Customers/Categories batch upsert (ON CONFLICT merge, sync logs)
│   │   │   ├── syncRetryService.ts   # Retry logic, exponential backoff, stale sync detection
│   │   │   ├── chatService.ts        # Orchestrates AI pipeline → executor → chart spec → chart image [implemented]
│   │   │   ├── chartRenderer.ts      # Server-side Chart.js → PNG rendering via chartjs-node-canvas [implemented]
│   │   │   ├── savedChartsService.ts # Dashboard saved charts CRUD [implemented]
│   │   │   ├── dashboardLayoutService.ts # Grid layout update [implemented]
│   │   │   ├── pdfReportService.ts   # PDF report generation via PDFKit + chartRenderer [implemented]
│   │   │   └── csvExportService.ts  # CSV export from saved chart data [implemented]
│   │   ├── utils/
│   │   │   ├── errors.ts             # Custom error classes
│   │   │   └── logger.ts             # Structured logging
│   │   └── ai/
│   │       ├── prompts/
│   │       │   ├── system.ts         # System prompt builder (schema + metadata + rules + few-shot) [implemented]
│   │       │   └── examples.ts       # 28 few-shot NL→SQL examples across 4 categories [implemented]
│   │       ├── schemaContext.ts       # Store metadata fetcher (counts, dates, currency) [implemented]
│   │       ├── types.ts              # Shared AI pipeline types (ChartSpec, AIQueryResult, etc.) [implemented]
│   │       ├── pipeline.ts           # Main NL→SQL→Result pipeline (OpenAI integration) [implemented]
│   │       ├── sqlValidator.ts       # SQL validation (SELECT-only, store_id, LIMIT, injection prevention) [implemented]
│   │       ├── queryExecutor.ts     # Execute validated SQL via read-only DB, return rows + metadata [implemented]
│   │       ├── revenueQueries.ts    # Revenue query service (total, by period, comparisons, breakdown) [implemented]
│   │       ├── productQueries.ts    # Product query service (top sellers, category performance, stock) [implemented]
│   │       ├── customerQueries.ts  # Customer query service (new vs returning, top spenders, CLV) [implemented]
│   │       ├── orderQueries.ts     # Order query service (count, AOV, status breakdown, recent) [implemented]
│   │       ├── chartSpec.ts          # AI → Chart.js config converter (ChartSpec + rows → ChartConfiguration) [implemented]
│   │       └── chartTypeConverter.ts # Chart type switcher (bar↔line↔pie↔doughnut↔table) [implemented]
│   ├── charts/                        # (unused — chart rendering lives in src/services/chartRenderer.ts)
│   ├── db/
│   │   ├── readonlyConnection.ts     # Read-only Knex pool for AI queries (SELECT-only, 5s timeout) [implemented]
│   │   ├── knexfile.ts               # Knex configuration
│   │   ├── init-readonly-user.sql    # PostgreSQL read-only user creation script [implemented]
│   │   ├── migrations/               # Database migrations
│   │   └── seeds/                    # Test data seeds
│   ├── tests/
│   │   ├── ai-test-cases.json        # Question→SQL test pairs
│   │   ├── unit/
│   │   │   ├── ai/
│   │   │   │   ├── systemPrompt.test.ts   # System prompt builder tests [implemented]
│   │   │   │   ├── examples.test.ts       # Few-shot examples tests [implemented]
│   │   │   │   ├── schemaContext.test.ts   # Schema context service tests [implemented]
│   │   │   │   ├── sqlValidator.test.ts    # SQL validator tests [implemented]
│   │   │   │   ├── pipeline.test.ts        # NL→SQL pipeline tests [implemented]
│   │   │   │   ├── queryExecutor.test.ts  # Query executor unit tests [implemented]
│   │   │   │   ├── revenueQueries.test.ts # Revenue query service unit tests [implemented]
│   │   │   │   ├── productQueries.test.ts # Product query service unit tests [implemented]
│   │   │   │   ├── customerQueries.test.ts # Customer query service unit tests [implemented]
│   │   │   │   ├── orderQueries.test.ts  # Order query service unit tests [implemented]
│   │   │   │   ├── chartSpec.test.ts    # Chart spec converter unit tests [implemented]
│   │   │   │   └── chartTypeConverter.test.ts # Chart type converter unit tests [implemented]
│   │   │   ├── db/
│   │   │   │   └── readonlyConnection.test.ts # Read-only connection factory tests [implemented]
│   │   │   ├── routes/
│   │   │   │   ├── landing.test.ts          # Landing page + /api/info unit tests [implemented]
│   │   │   ├── health.test.ts          # Health route unit tests [implemented]
│   │   │   │   ├── storeConnect.test.ts    # Store connect/status/disconnect unit tests [implemented]
│   │   │   │   ├── onboardingStatus.test.ts # Onboarding status unit tests [implemented]
│   │   │   │   ├── chatQuery.test.ts       # Chat query + suggestions unit tests [implemented]
│   │   │   │   ├── syncOrders.test.ts      # Sync orders route unit tests [implemented]
│   │   │   │   ├── syncProducts.test.ts    # Sync products route unit tests [implemented]
│   │   │   │   ├── syncCustomers.test.ts   # Sync customers route unit tests [implemented]
│   │   │   │   ├── syncCategories.test.ts  # Sync categories route unit tests [implemented]
│   │   │   │   ├── syncWebhook.test.ts     # Sync webhook route unit tests [implemented]
│   │   │   │   ├── syncStatus.test.ts      # Sync status route unit tests [implemented]
│   │   │   │   ├── syncErrors.test.ts      # Sync errors + retry route unit tests [implemented]
│   │   │   │   └── csvExport.test.ts      # CSV export route unit tests [implemented]
│   │   │   ├── services/
│   │   │   │   ├── chatService.test.ts   # Chat service unit tests (incl. chartImage) [implemented]
│   │   │   │   ├── chartRenderer.test.ts # Chart renderer unit tests [implemented]
│   │   │   │   └── csvExportService.test.ts # CSV export service unit tests [implemented]
│   │   │   ├── utils/
│   │   │   │   └── logger.test.ts         # Logger utility unit tests [implemented]
│   │   │   ├── server/
│   │   │   │   └── index.test.ts          # Server initialization wiring tests [implemented]
│   │   │   └── ...                        # Other unit tests
│   │   ├── integration/
│   │   │   ├── aiPipeline.test.ts          # AI pipeline integration tests [implemented]
│   │   │   ├── readonlyDb.test.ts          # Read-only DB enforcement tests [implemented]
│   │   │   ├── queryExecution.test.ts     # Query executor integration tests [implemented]
│   │   │   ├── revenueQueries.test.ts    # Revenue query integration tests [implemented]
│   │   │   ├── productQueries.test.ts    # Product query integration tests [implemented]
│   │   │   ├── customerQueries.test.ts  # Customer query integration tests [implemented]
│   │   │   ├── orderQueries.test.ts     # Order query integration tests [implemented]
│   │   │   ├── chartSpec.test.ts       # Chart spec converter integration tests [implemented]
│   │   │   ├── landing.test.ts        # Landing page integration tests [implemented]
│   │   │   ├── chartRenderer.test.ts  # Server-side chart renderer integration tests [implemented]
│   │   │   ├── chartTypeConverter.test.ts # Chart type converter integration tests [implemented]
│   │   │   ├── csvExport.test.ts        # CSV export integration tests [implemented]
│   │   │   └── ...                         # Other integration tests
│   │   └── e2e/                      # Playwright tests
│   ├── docker-compose.yml            # PostgreSQL + Redis for local dev
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   ├── features/                # Feature specifications
│   │   ├── README.md            # Feature index
│   │   └── _template.md         # Spec template
│   └── ai/                      # AI context maps
│       ├── architecture.md
│       ├── codestructure.md     # (this file)
│       ├── datamodel.md
│       ├── api-endpoints.md
│       ├── integrations.md
│       ├── utilities.md
│       └── technical-debt.md
├── agent_docs/                  # Deep reference docs for AI agent
│   ├── ai_pipeline.md
│   ├── data_sync.md
│   ├── security.md
│   └── wp_plugin_standards.md
├── scripts/
│   └── dev-loop.sh              # Automated dev loop
└── task-tracker.md              # Current task tracking
```

## Naming Conventions
- PHP classes: `class-{name}.php` (WordPress standard)
- TypeScript: `camelCase.ts` for files, `PascalCase` for classes/types
- React components: `PascalCase.jsx`
- Database migrations: `YYYYMMDDHHMMSS_description.ts`
- Feature specs: `docs/features/{kebab-case-slug}.md`
- Branches: `feature/{short-meaningful-name}`
