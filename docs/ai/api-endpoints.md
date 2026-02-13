# API Endpoints — AI Context Map

## SaaS Backend API

Base URL: `https://api.wooaianalytics.com` (production) / `http://localhost:3000` (local)

All endpoints except `/`, `/health`, `/api/info`, and `/api/stores/connect` require `Authorization: Bearer <api_key>` header.

### Landing & Info
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Public landing page (HTML), product info and features |
| GET | `/api/info` | Public API info: `{ name, version, description, status, documentation }` |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check, returns `{ status: "ok", version: "x.y.z" }` |

### Store Connection
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/stores/connect` | Register a new store. Body: `{ storeUrl, apiKey, wcVersion }` |
| GET | `/api/stores/status` | Check connection status and sync health |
| GET | `/api/stores/onboarding-status` | Check onboarding readiness: connected, hasSyncedData, recordCounts |
| DELETE | `/api/stores/disconnect` | Disconnect store, delete all synced data |

### Data Sync
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sync/orders` | Upsert orders batch. Body: `{ orders: [...] }` |
| POST | `/api/sync/products` | Upsert products batch. Body: `{ products: [...] }` |
| POST | `/api/sync/customers` | Upsert customers batch. Body: `{ customers: [...] }` |
| POST | `/api/sync/categories` | Upsert categories batch |
| POST | `/api/sync/coupons` | Upsert coupons batch |
| POST | `/api/sync/webhook` | Incremental sync single entity. Body: `{ resource, action, data }` |
| GET | `/api/sync/status` | Get sync health: lastSyncAt, recordCounts (orders/products/customers/categories), recentSyncs (last 10 sync_logs) |
| GET | `/api/sync/errors` | List failed/retryable syncs (retry_count < 5) for the authenticated store |
| POST | `/api/sync/retry/:syncLogId` | Schedule retry for a specific failed sync log entry |
| POST | `/api/sync/full` | Trigger a full re-sync |

### Chat (AI Queries)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/query` | Send a question, get AI answer + chart. Body: `{ question, conversationId? }`. Rate-limited: 20 req/min per store (429 + Retry-After header) |
| GET | `/api/chat/conversations` | List past conversations |
| GET | `/api/chat/conversations/:id` | Get full conversation history |
| DELETE | `/api/chat/conversations/:id` | Delete a conversation |
| GET | `/api/chat/suggestions` | Get suggested starter questions based on store data |

### Dashboards & Charts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboards/charts` | List saved charts [implemented] |
| POST | `/api/dashboards/charts` | Save a chart. Body: `{ title, queryText, chartConfig }` [implemented] |
| PUT | `/api/dashboards/charts/:id` | Update saved chart [implemented] |
| DELETE | `/api/dashboards/charts/:id` | Delete saved chart [implemented] |
| PUT | `/api/dashboards/grid-layout` | Update chart grid positions. Body: `{ items: [{ id, gridX, gridY, gridW, gridH }] }` [implemented] |

### Reports
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/reports/generate` | Generate PDF report from saved dashboard charts. Body: `{ title }` [implemented] |
| GET | `/api/reports` | List generated reports for the store [implemented] |
| GET | `/api/reports/:id/download` | Download PDF report file (application/pdf) [implemented] |
| DELETE | `/api/reports/:id` | Delete a generated report [implemented] |

### Exports
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/exports/csv` | Export saved charts as CSV. Body: `{ chartId? }`. Returns text/csv with BOM [implemented] |

### Scheduled Insights
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/scheduled-insights` | Create a scheduled insight. Body: `{ name, frequency, hour, dayOfWeek?, enabled? }` [implemented] |
| GET | `/api/scheduled-insights` | List all scheduled insights for the store [implemented] |
| PUT | `/api/scheduled-insights/:id` | Update a scheduled insight. Body: `{ name?, frequency?, hour?, dayOfWeek?, enabled? }` [implemented] |
| DELETE | `/api/scheduled-insights/:id` | Delete a scheduled insight [implemented] |

### Revenue Forecasts
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/forecasts` | Generate a revenue forecast. Body: `{ daysAhead: 7|14|30 }` [implemented] |
| GET | `/api/forecasts` | List all forecasts for the store [implemented] |
| GET | `/api/forecasts/:id` | Get a specific forecast with data points [implemented] |
| DELETE | `/api/forecasts/:id` | Delete a forecast [implemented] |

### Date Range Comparisons
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/comparisons` | Generate a date range comparison. Body: `{ preset }` or `{ currentStart, currentEnd, previousStart, previousEnd }` [implemented] |
| GET | `/api/comparisons` | List all comparisons for the store [implemented] |
| GET | `/api/comparisons/:id` | Get a specific comparison with metrics and breakdown [implemented] |
| DELETE | `/api/comparisons/:id` | Delete a comparison [implemented] |

## Plugin-Side Endpoints (WordPress AJAX)

These run inside WordPress via `admin-ajax.php`:

| Action | Description |
|--------|-------------|
| `waa_chat_query` | Proxies chat request to SaaS backend POST /api/chat/query (nonce required) [implemented] |
| `waa_chat_suggestions` | Proxies to GET /api/chat/suggestions — returns suggested questions (nonce required) [implemented] |
| `waa_sync_status` | Proxies to GET /api/sync/status — returns record counts, last sync time, recent sync logs (nonce required) |
| `waa_connect` | Initiates store connection to SaaS (nonce required) |
| `waa_disconnect` | Disconnects store (nonce required) |
| `waa_save_settings` | Saves API URL setting (nonce required) |
| `waa_test_connection` | Tests connection to backend health endpoint (nonce required) |
| `waa_complete_onboarding` | Marks onboarding wizard as completed (nonce required) [implemented] |
| `waa_dismiss_onboarding` | Marks onboarding wizard as dismissed/skipped (nonce required) [implemented] |
| `waa_onboarding_status` | Proxies to GET /api/stores/onboarding-status — returns readiness data (nonce required) [implemented] |
| `waa_save_chart` | Proxies to POST /api/dashboards/charts — saves chart to dashboard (nonce required) [implemented] |
| `waa_list_charts` | Proxies to GET /api/dashboards/charts — lists saved charts (nonce required) [implemented] |
| `waa_delete_chart` | Proxies to DELETE /api/dashboards/charts/:id — removes saved chart (nonce required) [implemented] |
| `waa_update_grid_layout` | Proxies to PUT /api/dashboards/grid-layout — updates chart grid positions (nonce required) [implemented] |
| `waa_generate_report` | Proxies to POST /api/reports/generate — generates PDF report (nonce required) [implemented] |
| `waa_list_reports` | Proxies to GET /api/reports — lists generated reports (nonce required) [implemented] |
| `waa_download_report` | Proxies to GET /api/reports/:id/download — downloads PDF (nonce required) [implemented] |
| `waa_export_csv` | Proxies to POST /api/exports/csv — exports chart data as CSV (nonce required) [implemented] |
| `waa_create_scheduled_insight` | Proxies to POST /api/scheduled-insights — creates scheduled insight (nonce required) [implemented] |
| `waa_list_scheduled_insights` | Proxies to GET /api/scheduled-insights — lists scheduled insights (nonce required) [implemented] |
| `waa_update_scheduled_insight` | Proxies to PUT /api/scheduled-insights/:id — updates scheduled insight (nonce required) [implemented] |
| `waa_delete_scheduled_insight` | Proxies to DELETE /api/scheduled-insights/:id — deletes scheduled insight (nonce required) [implemented] |
| `waa_generate_forecast` | Proxies to POST /api/forecasts — generates revenue forecast (nonce required) [implemented] |
| `waa_list_forecasts` | Proxies to GET /api/forecasts — lists revenue forecasts (nonce required) [implemented] |
| `waa_get_forecast` | Proxies to GET /api/forecasts/:id — gets a specific forecast (nonce required) [implemented] |
| `waa_delete_forecast` | Proxies to DELETE /api/forecasts/:id — deletes a forecast (nonce required) [implemented] |
| `waa_generate_comparison` | Proxies to POST /api/comparisons — generates date range comparison (nonce required) [implemented] |
| `waa_list_comparisons` | Proxies to GET /api/comparisons — lists date range comparisons (nonce required) [implemented] |
| `waa_get_comparison` | Proxies to GET /api/comparisons/:id — gets a specific comparison (nonce required) [implemented] |
| `waa_delete_comparison` | Proxies to DELETE /api/comparisons/:id — deletes a comparison (nonce required) [implemented] |

## Response Format (Standard)

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "processingTimeMs": 1234
  }
}
```

Error format:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable error message",
    "details": { ... }
  }
}
```

Rate limit error format (429):
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_ERROR",
    "message": "You've sent too many questions. Please wait a moment.",
    "retryAfter": 15
  }
}
```
Response includes `Retry-After` header with seconds until the window resets.
