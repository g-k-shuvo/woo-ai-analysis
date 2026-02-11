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
│   │   ├── class-webhooks.php          # WooCommerce incremental sync hooks (implemented)
│   │   └── class-admin-ui.php         # Admin page rendering & script enqueue
│   ├── admin/                   # React admin UI source
│   │   ├── src/
│   │   │   ├── App.jsx                # Root component
│   │   │   ├── components/
│   │   │   │   ├── ChatWindow.jsx     # Chat message thread
│   │   │   │   ├── ChatInput.jsx      # Message input + send
│   │   │   │   ├── ChartDisplay.jsx   # Chart.js chart rendering
│   │   │   │   ├── Dashboard.jsx      # Saved charts grid
│   │   │   │   ├── Settings.jsx       # Connection settings page
│   │   │   │   └── OnboardingWizard.jsx
│   │   │   └── hooks/
│   │   │       ├── useChat.js         # Chat state management
│   │   │       └── useSyncStatus.js   # Sync progress polling
│   │   ├── package.json
│   │   └── webpack.config.js          # @wordpress/scripts config
│   ├── assets/                  # Built CSS, images
│   ├── tests/                   # PHPUnit tests
│   └── composer.json
├── backend/                     # SaaS API server
│   ├── src/
│   │   ├── index.ts                   # Fastify server entry point
│   │   ├── config.ts                  # Environment config loader
│   │   ├── routes/
│   │   │   ├── health.ts             # GET /health
│   │   │   ├── stores.ts             # POST /api/stores/connect, GET /status, DELETE /disconnect
│   │   │   ├── sync/
│   │   │   │   ├── orders.ts         # POST /api/sync/orders
│   │   │   │   ├── products.ts       # POST /api/sync/products
│   │   │   │   ├── customers.ts      # POST /api/sync/customers
│   │   │   │   ├── categories.ts     # POST /api/sync/categories
│   │   │   │   └── webhook.ts        # POST /api/sync/webhook (incremental sync)
│   │   │   ├── chat/
│   │   │   │   └── query.ts          # POST /api/chat/query
│   │   │   └── dashboards/
│   │   │       └── index.ts          # CRUD for saved charts
│   │   ├── middleware/
│   │   │   ├── auth.ts               # API key validation (Bearer token, bcrypt compare)
│   │   │   ├── errorHandler.ts       # Global error handler + 404
│   │   │   └── rateLimit.ts          # Per-store rate limiting (planned)
│   │   ├── services/
│   │   │   ├── storeService.ts       # Store CRUD, connect/disconnect, API key verify
│   │   │   ├── syncService.ts        # Orders/Products/Customers/Categories batch upsert (ON CONFLICT merge, sync logs)
│   │   │   ├── chatService.ts        # Orchestrates AI pipeline (planned)
│   │   │   └── chartService.ts       # Chart rendering (planned)
│   │   └── utils/
│   │       ├── errors.ts             # Custom error classes
│   │       └── logger.ts             # Structured logging
│   ├── ai/
│   │   ├── prompts/
│   │   │   ├── system.ts             # System prompt template
│   │   │   └── examples.ts           # Few-shot NL→SQL examples
│   │   ├── pipeline.ts               # Main NL→SQL→Result pipeline
│   │   ├── validator.ts              # SQL validation (SELECT-only, store_id)
│   │   └── chartSpec.ts              # AI → Chart.js config converter
│   ├── charts/
│   │   ├── renderer.ts               # Chart.js server-side rendering
│   │   └── specs/                    # Default chart configurations
│   ├── db/
│   │   ├── knexfile.ts               # Knex configuration
│   │   ├── migrations/               # Database migrations
│   │   └── seeds/                    # Test data seeds
│   ├── tests/
│   │   ├── ai-test-cases.json        # Question→SQL test pairs
│   │   ├── unit/
│   │   ├── integration/
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
