# WordPress Plugin Standards — Deep Reference

## WordPress.org Submission Requirements

### Plugin Header
```php
<?php
/**
 * Plugin Name: Woo AI Analytics
 * Plugin URI: https://wooaianalytics.com
 * Description: AI-powered conversational analytics for WooCommerce. Chat with your store data.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * Author: Your Name
 * Author URI: https://yoursite.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: woo-ai-analytics
 * Domain Path: /languages
 * WC requires at least: 7.0
 * WC tested up to: 9.5
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}
```

### File Structure Requirements
- Main plugin file in root: `woo-ai-analytics.php`
- `readme.txt` in root (WordPress.org format, NOT markdown)
- `uninstall.php` for clean removal
- All classes in `includes/`
- All admin assets in `assets/` (built files only, no source)
- Translation files in `languages/`

### readme.txt Format
```
=== Woo AI Analytics ===
Contributors: yourname
Tags: woocommerce, analytics, ai, chat, reports
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later

AI-powered conversational analytics for WooCommerce stores.

== Description ==
...

== Installation ==
1. Upload the plugin to /wp-content/plugins/
2. Activate via Plugins menu
3. Go to WooCommerce → AI Analytics
4. Click "Connect" to set up

== Frequently Asked Questions ==
...

== Screenshots ==
1. Chat interface - screenshot-1.png
2. Dashboard - screenshot-2.png

== Changelog ==
= 1.0.0 =
* Initial release
```

### What WordPress.org Reviewers Check
1. **No external resource loading without consent** — JS/CSS from CDNs need user opt-in
2. **Sanitize/escape everything** — every input sanitized, every output escaped
3. **Nonces on all forms and AJAX** — `wp_nonce_field()`, `wp_verify_nonce()`
4. **Capability checks** — `current_user_can()` before sensitive actions
5. **No direct file access** — `defined('ABSPATH') || exit;` in every PHP file
6. **GPL-compatible license** — all dependencies must be GPL-compatible
7. **No obfuscated code** — all PHP must be readable
8. **No phone-home without consent** — external API calls need user activation
9. **Proper text domain** — all strings use `__('text', 'woo-ai-analytics')`
10. **No `$_GET`/`$_POST` without sanitization**

### Translation (i18n)
```php
// All user-facing strings:
__('Connect your store', 'woo-ai-analytics')
esc_html__('Settings saved.', 'woo-ai-analytics')
sprintf(__('Synced %d orders', 'woo-ai-analytics'), $count)

// In JavaScript (via wp_localize_script):
wp_localize_script('woo-ai-admin', 'wooAiData', [
    'ajaxUrl' => admin_url('admin-ajax.php'),
    'nonce'   => wp_create_nonce('woo_ai_nonce'),
    'i18n'    => [
        'askPlaceholder' => __('Ask a question about your store...', 'woo-ai-analytics'),
        'connecting'     => __('Connecting...', 'woo-ai-analytics'),
    ],
]);
```

### WooCommerce Compatibility
- Declare HPOS compatibility:
```php
add_action('before_woocommerce_init', function() {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
            'custom_order_tables', __FILE__, true
        );
    }
});
```
- Check WC is active before loading:
```php
if (!class_exists('WooCommerce')) {
    add_action('admin_notices', function() {
        echo '<div class="error"><p>' . 
             esc_html__('Woo AI Analytics requires WooCommerce.', 'woo-ai-analytics') . 
             '</p></div>';
    });
    return;
}
```

### Clean Uninstall
```php
// uninstall.php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

delete_option('woo_ai_api_key');
delete_option('woo_ai_settings');
delete_option('woo_ai_connected');
delete_transient('woo_ai_sync_status');
// Remove any scheduled cron events
wp_clear_scheduled_hook('woo_ai_scheduled_sync');
```
