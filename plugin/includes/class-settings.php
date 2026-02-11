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
		add_action( 'wp_ajax_waa_connect', array( $this, 'handle_connect' ) );
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
	 * Connect store to SaaS backend AJAX handler.
	 *
	 * Generates a 64-char API key, sends it with store URL to the backend,
	 * and stores the raw key locally for future authenticated requests.
	 */
	public function handle_connect(): void {
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

		// Generate a cryptographically secure 64-character API key.
		$api_key    = wp_generate_password( 64, false );
		$store_url  = site_url();
		$wc_version = defined( 'WC_VERSION' ) ? WC_VERSION : 'unknown';

		$response = wp_remote_post(
			trailingslashit( $api_url ) . 'api/stores/connect',
			array(
				'timeout' => 15,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'storeUrl'  => $store_url,
						'apiKey'    => $api_key,
						'wcVersion' => $wc_version,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			wp_send_json_error(
				array( 'message' => $response->get_error_message() )
			);
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 201 !== $status_code || empty( $body['success'] ) ) {
			$error_msg = $body['error']['message'] ?? __( 'Connection failed.', 'woo-ai-analytics' );
			wp_send_json_error( array( 'message' => $error_msg ) );
		}

		// Store the raw API key and mark as connected.
		update_option( 'waa_store_api_key', $api_key );
		update_option( 'waa_store_id', sanitize_text_field( $body['data']['storeId'] ?? '' ) );
		update_option( 'waa_connected', true );

		wp_send_json_success(
			array(
				'message' => __( 'Connected successfully!', 'woo-ai-analytics' ),
				'storeId' => $body['data']['storeId'] ?? '',
			)
		);
	}

	/**
	 * Build a Bearer token for SaaS backend requests.
	 *
	 * Format: base64(storeUrl:apiKey)
	 *
	 * @return string The Bearer token value, or empty string if not connected.
	 */
	public static function get_auth_token(): string {
		$api_key   = get_option( 'waa_store_api_key', '' );
		$store_url = site_url();

		if ( empty( $api_key ) ) {
			return '';
		}

		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		return base64_encode( $store_url . ':' . $api_key );
	}

	/**
	 * Disconnect AJAX handler.
	 *
	 * Calls the SaaS backend to delete all store data, then cleans up local options.
	 */
	public function handle_disconnect(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
		}

		$api_url    = get_option( 'waa_api_url', '' );
		$auth_token = self::get_auth_token();

		// Attempt to notify the backend (best-effort).
		if ( ! empty( $api_url ) && ! empty( $auth_token ) ) {
			wp_remote_request(
				trailingslashit( $api_url ) . 'api/stores/disconnect',
				array(
					'method'  => 'DELETE',
					'timeout' => 10,
					'headers' => array(
						'Authorization' => 'Bearer ' . $auth_token,
					),
				)
			);
		}

		// Clean up local state regardless of backend response.
		update_option( 'waa_connected', false );
		delete_option( 'waa_store_api_key' );
		delete_option( 'waa_store_id' );

		wp_send_json_success(
			array( 'message' => __( 'Disconnected.', 'woo-ai-analytics' ) )
		);
	}

	/**
	 * Prevent cloning.
	 */
	private function __clone() {}
}
