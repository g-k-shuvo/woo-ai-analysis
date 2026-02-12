<?php
/**
 * Admin UI class — registers menus and enqueues scripts.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handles WP admin menu registration and asset enqueuing.
 */
final class Admin_UI {

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
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	/**
	 * Register admin menu page.
	 */
	public function register_menu(): void {
		add_menu_page(
			__( 'AI Analytics', 'woo-ai-analytics' ),
			__( 'AI Analytics', 'woo-ai-analytics' ),
			'manage_woocommerce',
			'woo-ai-analytics',
			array( $this, 'render_page' ),
			'dashicons-chart-area',
			56
		);

		add_submenu_page(
			'woo-ai-analytics',
			__( 'Chat', 'woo-ai-analytics' ),
			__( 'Chat', 'woo-ai-analytics' ),
			'manage_woocommerce',
			'woo-ai-analytics',
			array( $this, 'render_page' )
		);

		add_submenu_page(
			'woo-ai-analytics',
			__( 'Settings', 'woo-ai-analytics' ),
			__( 'Settings', 'woo-ai-analytics' ),
			'manage_woocommerce',
			'woo-ai-analytics-settings',
			array( $this, 'render_page' )
		);
	}

	/**
	 * Render the React app mount point.
	 */
	public function render_page(): void {
		echo '<div id="woo-ai-analytics-root"></div>';
	}

	/**
	 * Enqueue admin scripts and styles.
	 *
	 * @param string $hook_suffix The current admin page hook suffix.
	 */
	public function enqueue_assets( string $hook_suffix ): void {
		if ( ! $this->is_plugin_page( $hook_suffix ) ) {
			return;
		}

		$asset_file = WAA_PLUGIN_DIR . 'assets/js/admin.asset.php';
		$asset      = file_exists( $asset_file )
			? require $asset_file
			: array(
				'dependencies' => array(),
				'version'      => WAA_VERSION,
			);

		wp_enqueue_script(
			'woo-ai-analytics-admin',
			WAA_PLUGIN_URL . 'assets/js/admin.js',
			$asset['dependencies'],
			$asset['version'],
			true
		);

		$css_file = WAA_PLUGIN_DIR . 'assets/js/admin.css';
		if ( file_exists( $css_file ) ) {
			wp_enqueue_style(
				'woo-ai-analytics-admin',
				WAA_PLUGIN_URL . 'assets/js/admin.css',
				array(),
				$asset['version']
			);
		}

		wp_localize_script(
			'woo-ai-analytics-admin',
			'waaData',
			array(
				'ajaxUrl'             => admin_url( 'admin-ajax.php' ),
				'nonce'               => wp_create_nonce( 'waa_nonce' ),
				'apiUrl'              => get_option( 'waa_api_url', '' ),
				'connected'           => (bool) get_option( 'waa_connected', false ),
				'onboardingComplete'  => Onboarding::is_completed() || Onboarding::is_dismissed(),
				'page'                => isset( $_GET['page'] ) ? sanitize_text_field( wp_unslash( $_GET['page'] ) ) : '', // phpcs:ignore WordPress.Security.NonceVerification
			)
		);
	}

	/**
	 * Check if current page is a plugin page.
	 *
	 * @param string $hook_suffix The current admin page hook suffix.
	 */
	private function is_plugin_page( string $hook_suffix ): bool {
		return str_contains( $hook_suffix, 'woo-ai-analytics' );
	}

	/**
	 * Prevent cloning.
	 */
	private function __clone() {}

	/**
	 * Prevent unserialization.
	 */
	public function __wakeup(): void {
		throw new \RuntimeException( 'Cannot unserialize singleton.' );
	}
}
