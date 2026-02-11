# Integrations — AI Context Map

## WooCommerce Integration

### Data Access Methods
1. **WC REST API v3** (primary for incremental sync)
   - Endpoints: `/wp-json/wc/v3/orders`, `/products`, `/customers`, `/coupons`
   - Auth: Consumer Key + Consumer Secret (generated in WC settings)
   - Rate limits: Varies by host, typically 25-100 requests/minute
   - Must use HTTPS

2. **Direct Database Queries** (for initial full sync — faster)
   - Use `$wpdb` with HPOS-compatible queries
   - HPOS tables: `wp_wc_orders`, `wp_wc_orders_meta` (not `wp_posts`)
   - Always check `wc_get_container()->get(CustomOrdersTableController::class)->custom_orders_table_usage_is_enabled()`

3. **WooCommerce Webhooks** (for real-time incremental sync)
   - `woocommerce_new_order` → sync new order to backend
   - `woocommerce_update_order` → update existing order
   - `woocommerce_order_status_changed` → update order status
   - `woocommerce_new_product` / `woocommerce_update_product`
   - `woocommerce_created_customer` / `woocommerce_update_customer`
   - Webhooks registered on plugin activation, removed on deactivation

### HPOS Compatibility (Critical)
WooCommerce High-Performance Order Storage is now default. Never use:
- `get_post_meta($order_id, ...)` → Use `$order->get_meta(...)`
- `$post->post_date` → Use `$order->get_date_created()`
- Direct `wp_posts` queries for orders → Use `wc_get_orders()` or HPOS tables

## OpenAI API Integration

### Models Used
- **GPT-4o**: Primary model for NL→SQL conversion (best accuracy)
- **GPT-4o-mini**: Fallback for simple queries (cost optimization)

### API Configuration
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Auth: Bearer token (API key stored in SaaS backend env, never in plugin)
- Temperature: 0.1 (low for consistent SQL generation)
- Max tokens: 2000 (sufficient for SQL + chart spec + explanation)
- Response format: JSON mode enabled

### PII Rules
Before sending any data context to OpenAI:
- Replace customer emails with `customer_[hash_prefix]`
- Replace customer names with `Customer #[id]`
- Never send raw addresses, phone numbers, or payment details
- Only send aggregated/anonymized data in the schema context

## Chart.js Integration

### Server-Side Rendering
- Library: `chartjs-node-canvas` (renders Chart.js on Node.js using canvas)
- Output: PNG (base64 encoded) + raw Chart.js config JSON
- Chart types: bar, line, pie, doughnut, table

### Client-Side Rendering
- Library: `chart.js` v4 (loaded in WP admin via `@wordpress/scripts`)
- Interactive charts in the chat UI
- Responsive, WP admin color scheme

## Redis Integration
- Session caching (store connection status)
- Rate limiting (per-store query limits)
- Job queue (BullMQ for background sync, report generation)
- Query result caching (cache frequent queries for 5 minutes)

## GitHub Integration
- `gh` CLI for PR management
- Gemini Code Assist / Jetrix for automated PR review
- `pr-review-toolkit` plugin for comprehensive review
