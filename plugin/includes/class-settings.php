<?php
/**
 * Settings class — handles AJAX for saving/loading settings.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handles plugin settings and AJAX handlers.
 */
final class Settings {

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
		add_action( 'wp_ajax_waa_save_settings', array( $this, 'handle_save_settings' ) );
		add_action( 'wp_ajax_waa_test_connection', array( $this, 'handle_test_connection' ) );
		add_action( 'wp_ajax_waa_disconnect', array( $this, 'handle_disconnect' ) );
	}

	/**
	 * Save settings AJAX handler.
	 */
	public function handle_save_settings(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
		}

		$api_url = isset( $_POST['api_url'] )
			? esc_url_raw( wp_unslash( $_POST['api_url'] ) )
			: '';

		if ( empty( $api_url ) ) {
			wp_send_json_error(
				array( 'message' => __( 'API URL is required.', 'woo-ai-analytics' ) )
			);
		}

		update_option( 'waa_api_url', $api_url );

		wp_send_json_success(
			array( 'message' => __( 'Settings saved.', 'woo-ai-analytics' ) )
		);
	}

	/**
	 * Test connection AJAX handler.
	 */
	public function handle_test_connection(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
		}

		$api_url = get_option( 'waa_api_url', '' );

		if ( empty( $api_url ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Please save an API URL first.', 'woo-ai-analytics' ) )
			);
		}

		$response = wp_remote_get(
			trailingslashit( $api_url ) . 'health',
			array( 'timeout' => 10 )
		);

		if ( is_wp_error( $response ) ) {
			update_option( 'waa_connected', false );
			wp_send_json_error(
				array( 'message' => $response->get_error_message() )
			);
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( isset( $body['status'] ) && 'ok' === $body['status'] ) {
			update_option( 'waa_connected', true );
			wp_send_json_success(
				array(
					'message' => __( 'Connected successfully.', 'woo-ai-analytics' ),
					'version' => $body['version'] ?? 'unknown',
				)
			);
		}

		update_option( 'waa_connected', false );
		wp_send_json_error(
			array( 'message' => __( 'Backend health check failed.', 'woo-ai-analytics' ) )
		);
	}

	/**
	 * Disconnect AJAX handler.
	 */
	public function handle_disconnect(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
		}

		update_option( 'waa_connected', false );
		delete_option( 'waa_store_api_key' );

		wp_send_json_success(
			array( 'message' => __( 'Disconnected.', 'woo-ai-analytics' ) )
		);
	}

	/**
	 * Prevent cloning.
	 */
	private function __clone() {}
}
