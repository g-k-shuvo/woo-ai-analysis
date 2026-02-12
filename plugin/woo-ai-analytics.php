<?php
/**
 * Plugin Name: Woo AI Analytics
 * Plugin URI: https://github.com/user/woo-ai-analytics
 * Description: AI-powered conversational analytics for WooCommerce stores.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * Author: Woo AI Analytics
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: woo-ai-analytics
 * Domain Path: /languages
 * WC requires at least: 8.0
 * WC tested up to: 9.0
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Plugin constants
define( 'WAA_VERSION', '1.0.0' );
define( 'WAA_PLUGIN_FILE', __FILE__ );
define( 'WAA_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'WAA_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'WAA_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

// HPOS compatibility declaration
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
				'custom_order_tables',
				__FILE__,
				true
			);
		}
	}
);

/**
 * Check if WooCommerce is active.
 */
function waa_is_woocommerce_active(): bool {
	return in_array(
		'woocommerce/woocommerce.php',
		apply_filters( 'active_plugins', get_option( 'active_plugins', array() ) ),
		true
	);
}

/**
 * Plugin activation hook.
 */
function waa_activate(): void {
	if ( ! waa_is_woocommerce_active() ) {
		deactivate_plugins( WAA_PLUGIN_BASENAME );
		wp_die(
			esc_html__( 'Woo AI Analytics requires WooCommerce to be installed and active.', 'woo-ai-analytics' ),
			'Plugin dependency check',
			array( 'back_link' => true )
		);
	}

	add_option( 'waa_api_url', '' );
	add_option( 'waa_store_api_key', '' );
	add_option( 'waa_store_id', '' );
	add_option( 'waa_connected', false );
	add_option( 'waa_version', WAA_VERSION );
}
register_activation_hook( __FILE__, 'waa_activate' );

/**
 * Plugin deactivation hook.
 */
function waa_deactivate(): void {
	// Clean up transients
	delete_transient( 'waa_sync_status' );
}
register_deactivation_hook( __FILE__, 'waa_deactivate' );

// Add "Settings" link to the Plugins list page.
add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( array $links ): array {
		$settings_link = sprintf(
			'<a href="%s">%s</a>',
			esc_url( admin_url( 'admin.php?page=woo-ai-analytics-settings' ) ),
			esc_html__( 'Settings', 'woo-ai-analytics' )
		);
		array_unshift( $links, $settings_link );
		return $links;
	}
);

// Load plugin
require_once WAA_PLUGIN_DIR . 'includes/class-plugin.php';

add_action(
	'plugins_loaded',
	function () {
		if ( ! waa_is_woocommerce_active() ) {
			add_action(
				'admin_notices',
				function () {
					echo '<div class="notice notice-error"><p>';
					echo esc_html__( 'Woo AI Analytics requires WooCommerce to be installed and active.', 'woo-ai-analytics' );
					echo '</p></div>';
				}
			);
			return;
		}

		WooAIAnalytics\Plugin::get_instance();
	}
);
