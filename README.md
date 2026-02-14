# Woo AI Analytics

AI-powered conversational analytics for WooCommerce. Store owners chat with their store data in natural language, get AI-generated answers with interactive charts, save dashboards, and export reports.

## Local Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org/) | 20+ | Backend API + plugin build tooling |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest | PostgreSQL 16 + Redis 7 |
| [Local](https://localwp.com/) (by WP Engine) | Latest | WordPress dev environment |
| [WooCommerce](https://woocommerce.com/) | 8.0+ | Install as plugin inside Local site |
| [GitHub CLI](https://cli.github.com/) (`gh`) | Latest | PR creation & review |
| [Claude Code](https://claude.ai/download) | Latest | AI-assisted development |

> **No global PHP or Composer required.** Plugin tests run via Docker (see Testing section below).

### 1. Backend Setup

```bash
git clone <repo-url> && cd woo-ai-analytics

# Start PostgreSQL + Redis
cd backend && docker-compose up -d

# Install dependencies
npm install

# Create a .env file with required variables
cat <<'EOF' > .env
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=postgresql://woo_ai:woo_ai_pass@localhost:5432/woo_ai_analytics
DATABASE_READONLY_URL=postgresql://woo_ai_readonly:woo_ai_pass@localhost:5432/woo_ai_analytics
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-your-key-here
EOF

# Run database migrations
npm run migrate

# Start the dev server (http://localhost:3000)
npm run dev
```

### 2. Plugin Setup (Local app)

1. **Create a Local site** — open the Local app, create a new site (e.g. "woo-analytics-dev"), and start it.
2. **Install WooCommerce** — in the Local site's WP Admin, go to Plugins → Add New → search "WooCommerce" → Install & Activate.
3. **Symlink the plugin** into the Local site's plugins directory:

```bash
# Windows (run terminal as Administrator)
mklink /D "C:\Users\<you>\Local Sites\woo-analytics-dev\app\public\wp-content\plugins\woo-ai-analytics" "D:\path\to\woo-ai-analytics\plugin"

# macOS / Linux
ln -s /path/to/woo-ai-analytics/plugin ~/Local\ Sites/woo-analytics-dev/app/public/wp-content/plugins/woo-ai-analytics
```

4. **Build the React admin UI:**

```bash
cd plugin && npm install && npm run build
```

5. **Activate the plugin** in WP Admin → Plugins.
6. **Configure the API URL** — go to WP Admin → Woo AI Analytics → Settings and set the Backend API URL to `http://localhost:3000`.

### 3. Daily Development

Run two terminals side-by-side:

| Terminal | Directory | Command | What it does |
|----------|-----------|---------|--------------|
| 1 | `backend/` | `npm run dev` | Fastify API with hot-reload |
| 2 | `plugin/` | `npm run start` | Webpack watch for React admin UI |

### Important Notes

- **WooCommerce must be active** — the plugin checks for WooCommerce and will show an admin notice if it's missing.
- **Symlink on Windows** requires an elevated (Administrator) terminal, or Developer Mode enabled.
- **Environment variables** — never commit `.env`. See the table below for all supported variables.
- **Docker services** — run `docker-compose up -d` from `backend/` before starting the dev server. Use `docker-compose down` to stop.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Backend server port |
| `HOST` | `0.0.0.0` | Backend server host |
| `NODE_ENV` | `development` | Environment |
| `DATABASE_URL` | `postgresql://woo_ai:woo_ai_pass@localhost:5432/woo_ai_analytics` | PostgreSQL connection string |
| `DATABASE_READONLY_URL` | `postgresql://woo_ai_readonly:woo_ai_pass@localhost:5432/woo_ai_analytics` | Read-only DB connection (used for AI-generated queries) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `OPENAI_API_KEY` | *(required)* | OpenAI API key for AI features |
| `RATE_LIMIT_CHAT_MAX` | `20` | Max chat requests per rate-limit window |
| `RATE_LIMIT_CHAT_WINDOW` | `60` | Rate-limit window in seconds |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

### Available Scripts

#### Root (from project root)

| Command | Description |
|---------|-------------|
| `npm run docker:up` | Start PostgreSQL + Redis containers |
| `npm run docker:down` | Stop containers |
| `npm run dev:backend` | Start backend dev server |
| `npm run dev:plugin` | Start plugin dev build (watch mode) |
| `npm run build:all` | Build backend + plugin |
| `npm run lint:all` | Lint backend + plugin |
| `npm run test:all` | Run all tests |

#### Backend (`cd backend`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with hot-reload (tsx) |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled production build |
| `npm test` | Run all tests (Jest) |
| `npm run test:unit` | Unit tests only |
| `npm run test:integration` | Integration tests only |
| `npm run lint` | Run ESLint |
| `npm run migrate` | Run database migrations (Knex) |
| `npm run migrate:rollback` | Rollback last migration |
| `npm run seed` | Seed the database |

#### Plugin (`cd plugin`)

| Command | Description |
|---------|-------------|
| `npm run start` | Dev build with watch mode |
| `npm run build` | Production build |
| `npm run lint` | Lint JS/React |
| `npm run format` | Format code |
| `composer test` | Run PHPUnit tests (requires PHP or Docker — see below) |

### Testing & Linting

```bash
# Backend tests (Jest)
cd backend && npm test            # all tests
cd backend && npm run test:unit   # unit only
cd backend && npm run test:integration  # integration only

# Backend lint
cd backend && npm run lint

# Plugin tests (PHPUnit via Docker — no local PHP needed)
cd plugin
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/app" -w /app composer:2 install
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/app" -w /app php:8.2-cli vendor/bin/phpunit

# Plugin build
cd plugin && npm run build

# All tests from project root
npm run test:all
npm run lint:all
```

### Development with Claude Code
```bash
# Start Claude Code from project root
claude

# Plan a feature
/plan <feature-description>

# Implement a task from tracker
/implement-task <task-id>

# Review and fix a PR
/review-and-fix

# Run the automated dev loop
./scripts/dev-loop.sh --iterations 3 --verbose
```

## Architecture
- **plugin/**: WordPress plugin (PHP + React)
- **backend/**: SaaS API (Node.js + Fastify + PostgreSQL)
- **docs/features/**: Feature specifications
- **docs/ai/**: AI context maps for Claude Code

See `docs/ai/architecture.md` for the full system design.

## License
GPL v2 or later
