=== Woo AI Analytics ===
Contributors: wooaianalytics
Tags: woocommerce, analytics, ai, chat, reports
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

AI-powered conversational analytics for WooCommerce stores. Chat with your store data using natural language.

== Description ==

Woo AI Analytics lets WooCommerce store owners chat with their store data using natural language. Ask questions like "What were my top 5 products last month?" and get instant answers with charts and reports.

**Features:**

* Natural language queries about orders, products, customers, and revenue
* Auto-generated charts (bar, line, pie, doughnut)
* Real-time data sync from WooCommerce
* Saved charts and custom dashboards
* Privacy-focused: customer data is anonymized before AI processing

**Requirements:**

* WooCommerce 8.0 or higher
* PHP 8.0 or higher
* WordPress 6.0 or higher

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/woo-ai-analytics/` or install through the WordPress plugins screen.
2. Activate the plugin through the 'Plugins' screen in WordPress.
3. Go to AI Analytics → Settings to configure your API connection.
4. Click "Connect" to start syncing your store data.
5. Navigate to AI Analytics → Chat to start asking questions.

== Frequently Asked Questions ==

= Does this plugin send my data to external services? =

Yes, store data (orders, products, categories) is synced to the Woo AI Analytics SaaS backend for AI processing. Customer emails are never stored in plaintext — they are hashed with SHA-256 before transmission.

= What AI model is used? =

The plugin uses OpenAI GPT-4o for natural language to SQL conversion.

== Changelog ==

= 1.0.0 =
* Initial release
