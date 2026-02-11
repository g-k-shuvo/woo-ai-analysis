# API Endpoints — AI Context Map

## SaaS Backend API

Base URL: `https://api.wooaianalytics.com` (production) / `http://localhost:3000` (local)

All endpoints except `/health` require `Authorization: Bearer <api_key>` header.

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check, returns `{ status: "ok", version: "x.y.z" }` |

### Store Connection
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/stores/connect` | Register a new store. Body: `{ storeUrl, apiKey, wcVersion }` |
| GET | `/api/stores/status` | Check connection status and sync health |
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
| GET | `/api/sync/status` | Get sync health: last sync time, record counts, errors |
| POST | `/api/sync/full` | Trigger a full re-sync |

### Chat (AI Queries)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/query` | Send a question, get AI answer + chart. Body: `{ question, conversationId? }` |
| GET | `/api/chat/conversations` | List past conversations |
| GET | `/api/chat/conversations/:id` | Get full conversation history |
| DELETE | `/api/chat/conversations/:id` | Delete a conversation |
| GET | `/api/chat/suggestions` | Get suggested starter questions based on store data |

### Dashboards & Charts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboards/charts` | List saved charts |
| POST | `/api/dashboards/charts` | Save a chart. Body: `{ title, queryText, chartConfig }` |
| PUT | `/api/dashboards/charts/:id` | Update saved chart |
| DELETE | `/api/dashboards/charts/:id` | Delete saved chart |
| PUT | `/api/dashboards/layout` | Update chart positions. Body: `{ positions: [...] }` |

### Reports (Phase 2)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/reports/generate` | Generate PDF/CSV report |
| GET | `/api/reports` | List generated reports |
| GET | `/api/reports/:id/download` | Download report file |

## Plugin-Side Endpoints (WordPress AJAX)

These run inside WordPress via `admin-ajax.php`:

| Action | Description |
|--------|-------------|
| `woo_ai_chat_query` | Proxies chat request to SaaS backend (nonce required) |
| `woo_ai_sync_status` | Returns current sync progress (nonce required) |
| `woo_ai_connect` | Initiates store connection to SaaS |
| `woo_ai_disconnect` | Disconnects store |

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
