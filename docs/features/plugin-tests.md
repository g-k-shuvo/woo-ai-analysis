# Feature Spec: Plugin Tests (Task 5.5)

## Objective
Achieve comprehensive PHPUnit test coverage for all untested WordPress plugin
PHP classes: **Plugin**, **Admin_UI**, and **Webhooks**. Existing tests already
cover Settings (45), Ajax_Handler (59), and Onboarding (25).

## Scope

### In Scope
- Unit tests for `Plugin` class (singleton, hook registration, textdomain)
- Unit tests for `Admin_UI` class (menu registration, asset enqueue, page render)
- Unit tests for `Webhooks` class (all 4 entity sync flows + transforms + PII)
- Bootstrap updates for WooCommerce class stubs (WC_Order, WC_Product, WC_Customer)
- Bootstrap updates for missing WP function stubs (add_menu_page, wp_enqueue_script, etc.)

### Out of Scope
- Integration tests requiring live WordPress or WooCommerce
- E2E Playwright tests (separate task)
- React component tests (frontend, not PHP)

## Test Plan

### PluginTest.php (~8 tests)
- Singleton returns same instance
- Constructor loads all includes (5 require_once calls)
- Constructor registers `init` hook for textdomain
- Constructor initializes Admin_UI, Settings, Ajax_Handler, Onboarding singletons
- Constructor always initializes Webhooks singleton
- load_textdomain calls load_plugin_textdomain with correct args

### AdminUITest.php (~20 tests)
- Singleton pattern
- Constructor registers admin_menu and admin_enqueue_scripts hooks
- register_menu creates main menu page with correct params
- register_menu creates Chat submenu page
- register_menu creates Settings submenu page
- All menu pages require manage_woocommerce capability
- render_page outputs React mount div
- enqueue_assets skips non-plugin pages
- enqueue_assets loads JS on plugin pages
- enqueue_assets loads CSS when file exists
- enqueue_assets skips CSS when file missing
- enqueue_assets localizes script with waaData
- Localized data includes ajaxUrl, nonce, apiUrl, connected, page
- Localized data includes onboardingComplete status

### WebhooksTest.php (~60 tests)
- Singleton pattern
- Constructor registers all 8 WooCommerce hooks
- **Orders**: on_order_created/updated call sync, transform_order correctness
- **Products**: on_product_created/updated call sync, transform_product correctness
- **Customers**: on_customer_created/updated call sync, transform_customer correctness
- **Categories**: on_category_created/updated call sync, transform_category correctness
- **PII protection**: Customer email is SHA-256 hashed, never sent raw
- **send_webhook**: Correct URL, auth header, JSON payload
- **send_webhook**: Skips when not connected
- **send_webhook**: Skips when no API URL or auth token
- **Error handling**: Exceptions caught silently, WooCommerce not disrupted
- **Transform edge cases**: Null dates, empty coupons, missing product SKU

## Impacted Files
- `plugin/tests/bootstrap.php` — Add WC stubs + WP UI stubs
- `plugin/tests/Unit/PluginTest.php` — NEW
- `plugin/tests/Unit/AdminUITest.php` — NEW
- `plugin/tests/Unit/WebhooksTest.php` — NEW

## Coverage Target
90%+ across all 6 plugin classes combined.
