# Woo AI Analytics

AI-powered conversational analytics for WooCommerce. Store owners chat with their store data in natural language, get AI-generated answers with interactive charts, save dashboards, and export reports.

## Quick Start

### Prerequisites
- Node.js 20+, npm 10+
- PHP 8.0+, Composer
- Docker Desktop
- Claude Code (`curl -fsSL https://claude.ai/install.sh | bash`)
- GitHub CLI (`gh`)

### Setup
```bash
git clone <repo-url> && cd woo-ai-analytics

# Start backend infrastructure
cd backend && docker-compose up -d
npm install
npx knex migrate:latest
npm run dev

# In another terminal — start plugin dev
cd plugin && npm install && composer install
npm run start
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
