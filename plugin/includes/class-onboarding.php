<?php
/**
 * Onboarding class — handles onboarding wizard AJAX actions.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handles onboarding wizard state management via AJAX.
 */
final class Onboarding {

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
		add_action( 'wp_ajax_waa_complete_onboarding', array( $this, 'handle_complete_onboarding' ) );
		add_action( 'wp_ajax_waa_dismiss_onboarding', array( $this, 'handle_dismiss_onboarding' ) );
		add_action( 'wp_ajax_waa_onboarding_status', array( $this, 'handle_onboarding_status' ) );
	}

	/**
	 * Check if onboarding is completed.
	 */
	public static function is_completed(): bool {
		return (bool) get_option( 'waa_onboarding_completed', false );
	}

	/**
	 * Check if onboarding is dismissed.
	 */
	public static function is_dismissed(): bool {
		return (bool) get_option( 'waa_onboarding_dismissed', false );
	}

	/**
	 * Mark onboarding as complete AJAX handler.
	 */
	public function handle_complete_onboarding(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		update_option( 'waa_onboarding_completed', true );

		wp_send_json_success(
			array( 'message' => __( 'Onboarding completed.', 'woo-ai-analytics' ) )
		);
	}

	/**
	 * Dismiss onboarding wizard AJAX handler.
	 */
	public function handle_dismiss_onboarding(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		update_option( 'waa_onboarding_dismissed', true );

		wp_send_json_success(
			array( 'message' => __( 'Onboarding dismissed.', 'woo-ai-analytics' ) )
		);
	}

	/**
	 * Get onboarding status from backend AJAX handler.
	 *
	 * Proxies to the SaaS backend GET /api/stores/onboarding-status endpoint.
	 */
	public function handle_onboarding_status(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		$api_url    = get_option( 'waa_api_url', '' );
		$auth_token = Settings::get_auth_token();

		if ( empty( $api_url ) || empty( $auth_token ) ) {
			wp_send_json_success(
				array(
					'connected'     => false,
					'hasSyncedData' => false,
					'recordCounts'  => array(
						'orders'     => 0,
						'products'   => 0,
						'customers'  => 0,
						'categories' => 0,
					),
				)
			);
			return;
		}

		$response = wp_remote_get(
			trailingslashit( $api_url ) . 'api/stores/onboarding-status',
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			wp_send_json_error(
				array( 'message' => $response->get_error_message() )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to fetch onboarding status.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( $body['data'] );
	}

	/**
	 * Prevent cloning.
	 */
	private function __clone() {}
}
