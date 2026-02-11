<?php
/**
 * Core plugin class.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Main plugin singleton.
 */
final class Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;

	/**
	 * Get singleton instance.
	 */
	public static function get_instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->load_includes();
		$this->init_hooks();
	}

	/**
	 * Load required files.
	 */
	private function load_includes(): void {
		require_once WAA_PLUGIN_DIR . 'includes/class-admin-ui.php';
		require_once WAA_PLUGIN_DIR . 'includes/class-settings.php';
		require_once WAA_PLUGIN_DIR . 'includes/class-ajax-handler.php';
		require_once WAA_PLUGIN_DIR . 'includes/class-webhooks.php';
	}

	/**
	 * Initialize hooks.
	 */
	private function init_hooks(): void {
		add_action( 'init', array( $this, 'load_textdomain' ) );

		if ( is_admin() ) {
			Admin_UI::get_instance();
			Settings::get_instance();
			Ajax_Handler::get_instance();
		}

		// Webhook hooks run on both admin and frontend (cron, REST API contexts).
		Webhooks::get_instance();
	}

	/**
	 * Load plugin translations.
	 */
	public function load_textdomain(): void {
		load_plugin_textdomain(
			'woo-ai-analytics',
			false,
			dirname( WAA_PLUGIN_BASENAME ) . '/languages'
		);
	}

	/**
	 * Prevent cloning.
	 */
	private function __clone() {}
}
