# Utilities — AI Context Map

## Backend Utilities (`backend/src/utils/`)

### errors.ts
Custom error classes with structured error codes:
- `AppError` — Base error class with `code`, `message`, `statusCode`, `cause`
- `ValidationError` — 400 errors for invalid input
- `AuthError` — 401/403 for auth failures
- `NotFoundError` — 404
- `RateLimitError` — 429 for exceeded query limits
- `AIError` — 500 for AI pipeline failures
- `SyncError` — 500 for data sync failures

### logger.ts
Structured JSON logging using Pino:
- Log levels: error, warn, info, debug
- Always include `store_id` and `requestId` in log context
- Mask PII fields in logs

### validators.ts
Input validation helpers:
- `validateStoreUrl(url)` — validates WooCommerce store URL
- `validateApiKey(key)` — validates API key format
- `validateSql(sql)` — validates AI-generated SQL is safe
- `validateDateRange(start, end)` — validates date parameters

### crypto.ts
Security utilities:
- `hashApiKey(key)` — bcrypt hash for storage
- `verifyApiKey(key, hash)` — bcrypt comparison
- `hashEmail(email)` — SHA256 for PII-safe storage
- `generateApiKey()` — secure random key generation

## Plugin Utilities (`plugin/includes/`)

### WordPress Helpers
- Nonce verification: Always use `wp_verify_nonce()` in AJAX handlers
- Capability checks: `current_user_can('manage_woocommerce')`
- Sanitization: `sanitize_text_field()`, `absint()`, `esc_sql()`
- Escaping: `esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses_post()`
- Options API: `get_option('woo_ai_api_key')`, `update_option()`
- Transients: `set_transient()` for caching sync status

## Shared Patterns

### Error Handling
```typescript
// Backend: Always wrap with context
throw new AppError('Failed to sync orders', { cause: err, code: 'SYNC_ERROR' });

// PHP: Always check return values
$response = wp_remote_post($url, $args);
if (is_wp_error($response)) {
    error_log('Woo AI: Sync failed - ' . $response->get_error_message());
    return false;
}
```

### Database Queries
```typescript
// Always parameterized, always with store_id
const orders = await db('orders')
  .where('store_id', storeId)
  .where('date_created', '>=', startDate)
  .orderBy('date_created', 'desc')
  .limit(100);
```
