# Security — Deep Reference

## Authentication Flow

### Store → SaaS Backend
1. Plugin generates a random 64-character API key on connection
2. Key is hashed with bcrypt (12 rounds) and stored in SaaS DB
3. Raw key is stored in WP `wp_options` (encrypted if host supports it)
4. Every request from plugin includes `Authorization: Bearer <raw_key>`
5. Backend middleware verifies: hash matches + store is active

### WP Admin → Plugin AJAX
1. Plugin enqueues scripts with `wp_localize_script()` including a nonce
2. Every AJAX request includes the nonce in the request body
3. PHP handler verifies: `wp_verify_nonce()` + `current_user_can('manage_woocommerce')`

## Data Protection

### In Transit
- All plugin→SaaS communication: HTTPS (TLS 1.2+) enforced
- All SaaS→OpenAI communication: HTTPS
- All SaaS→PostgreSQL: SSL connection required in production

### At Rest
- PostgreSQL: Encrypted at rest (managed DB default on DO/AWS)
- S3/R2 storage: Server-side encryption enabled
- API keys: bcrypt hashed in DB, never stored in plaintext
- Customer emails: SHA256 hashed, never stored in plaintext

### PII Handling
**NEVER send to OpenAI or any external API:**
- Customer emails (even hashed)
- Customer names
- Addresses, phone numbers
- Payment method details (card numbers, etc.)

**What CAN be sent to OpenAI:**
- Aggregated metrics (totals, counts, averages)
- Product names, categories, SKUs
- Order statuses and dates
- Anonymous customer IDs (e.g., "Customer #42")
- Store-level settings (currency, timezone)

## SQL Sandboxing

### Read-Only Database User
```sql
CREATE USER ai_reader WITH PASSWORD 'strong_password';
GRANT CONNECT ON DATABASE woo_analytics TO ai_reader;
GRANT USAGE ON SCHEMA public TO ai_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ai_reader;
-- NO insert, update, delete, create, drop permissions
```

### Query Validation Checklist
- [ ] Starts with SELECT
- [ ] Does NOT contain: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE, GRANT
- [ ] Contains `store_id` reference (tenant isolation)
- [ ] Has LIMIT clause (max 1000)
- [ ] Statement timeout: 5 seconds
- [ ] Executed on read-only connection pool

### Rate Limiting
| Plan | Queries/Day | Queries/Hour |
|------|-------------|-------------|
| Free | 10 | 5 |
| Starter | 50 | 25 |
| Pro | Unlimited | 100 |
| Agency | Unlimited | 200 |

Rate limits tracked in Redis per `store_id`.

## WordPress Security Standards
- Use `wp_nonce_field()` / `wp_verify_nonce()` for all forms
- Use `current_user_can()` for capability checks
- Sanitize ALL input: `sanitize_text_field()`, `absint()`, `sanitize_url()`
- Escape ALL output: `esc_html()`, `esc_attr()`, `esc_url()`, `wp_kses_post()`
- Never use `$_GET`/`$_POST` directly — always sanitize first
- Use `$wpdb->prepare()` for any direct database queries
- No `eval()`, `exec()`, `system()`, or `passthru()` calls

## GDPR Compliance
- Data export endpoint: Store owner can export all their synced data
- Data deletion endpoint: Store owner can delete all data on disconnect
- Privacy policy: Document what data is collected and how it's processed
- Data retention: Delete conversation history after 90 days (configurable)
- Right to erasure: `DELETE /api/stores/disconnect` removes all store data
