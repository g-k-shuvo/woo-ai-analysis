=== Woo AI Analytics ===
Contributors: wooaianalytics
Tags: woocommerce, analytics, ai, chat, reports
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

AI-powered conversational analytics for WooCommerce stores. Chat with your store data using natural language.

== Description ==

Woo AI Analytics lets WooCommerce store owners chat with their store data using natural language. Ask questions like "What were my top 5 products last month?" and get instant answers with charts and reports.

**Features:**

* Natural language queries about orders, products, customers, and revenue
* Auto-generated charts (bar, line, pie, doughnut) and data tables
* Real-time data sync from WooCommerce via hooks
* Onboarding wizard for quick setup
* Privacy-focused: customer emails are hashed before transmission

**How it works:**

1. Connect your WooCommerce store to the Woo AI Analytics backend.
2. Your store data (orders, products, categories) syncs automatically.
3. Ask questions in plain English from the Chat page in WP admin.
4. AI converts your question to a database query and returns results with charts.

**Requirements:**

* WooCommerce 8.0 or higher
* PHP 8.0 or higher
* WordPress 6.0 or higher

**Third-Party Services:**

This plugin connects to the Woo AI Analytics SaaS backend to process natural language queries and sync store data. The backend uses OpenAI GPT-4o for natural language to SQL conversion. Customer email addresses are hashed with SHA-256 before transmission — no plaintext PII is sent to external services.

* [Woo AI Analytics Terms of Service](https://wooaianalytics.com/terms)
* [Woo AI Analytics Privacy Policy](https://wooaianalytics.com/privacy)
* [OpenAI Terms of Use](https://openai.com/policies/terms-of-use)
* [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy)

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/woo-ai-analytics/` or install through the WordPress plugins screen.
2. Activate the plugin through the 'Plugins' screen in WordPress.
3. Go to AI Analytics in the left menu to start the onboarding wizard.
4. Enter your API URL and click "Connect" to start syncing your store data.
5. Navigate to AI Analytics → Chat to start asking questions.

== Frequently Asked Questions ==

= Does this plugin send my data to external services? =

Yes, store data (orders, products, categories) is synced to the Woo AI Analytics SaaS backend for AI processing. Customer email addresses are never stored in plaintext — they are hashed with SHA-256 before transmission.

= What AI model is used? =

The plugin uses OpenAI GPT-4o for natural language to SQL conversion. Your questions are converted to database queries that run against your synced store data.

= Is my data secure? =

All communication with the backend uses HTTPS. API keys are encrypted at rest using AES-256-CBC with your WordPress auth salt. AI-generated SQL queries are restricted to SELECT-only operations and run against a read-only database user.

= Can I disconnect and delete my data? =

Yes. Go to AI Analytics → Settings and click "Disconnect". This removes all your data from the SaaS backend and deletes local connection credentials.

= What happens when I uninstall the plugin? =

All plugin options and transients are removed from your WordPress database. No residual data is left behind.

== Screenshots ==

1. Chat interface — ask questions about your store in natural language.
2. Chart visualization — auto-generated bar, line, and pie charts.
3. Settings page — connect your store to the analytics backend.
4. Onboarding wizard — guided setup in four steps.

== Changelog ==

= 1.0.0 =
* Initial release.
* Natural language chat interface for WooCommerce analytics.
* Auto-generated charts (bar, line, pie, doughnut) and data tables.
* Real-time data sync via WooCommerce hooks.
* Onboarding wizard for guided setup.
* Privacy-focused: customer emails hashed before transmission.

== Upgrade Notice ==

= 1.0.0 =
Initial release of Woo AI Analytics. Requires WooCommerce 8.0+ and PHP 8.0+.
