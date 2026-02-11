<?php
/**
 * AJAX Handler class — handles chat query AJAX requests.
 *
 * Proxies chat queries from the WP admin React UI to the SaaS backend.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handles chat-related AJAX endpoints.
 */
final class Ajax_Handler {

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
		add_action( 'wp_ajax_waa_chat_query', array( $this, 'handle_chat_query' ) );
		add_action( 'wp_ajax_waa_chat_suggestions', array( $this, 'handle_chat_suggestions' ) );
	}

	/**
	 * Chat query AJAX handler.
	 *
	 * Proxies a natural language question to the SaaS backend POST /api/chat/query.
	 */
	public function handle_chat_query(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		$question = isset( $_POST['question'] )
			? sanitize_text_field( wp_unslash( $_POST['question'] ) )
			: '';

		if ( empty( $question ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Question cannot be empty.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$api_url    = get_option( 'waa_api_url', '' );
		$auth_token = Settings::get_auth_token();

		if ( empty( $api_url ) || empty( $auth_token ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Store is not connected.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$response = wp_remote_post(
			trailingslashit( $api_url ) . 'api/chat/query',
			array(
				'timeout' => 30,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $auth_token,
				),
				'body'    => wp_json_encode(
					array( 'question' => $question )
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
			$error_msg = __( 'Failed to process question.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( $body['data'] );
	}

	/**
	 * Chat suggestions AJAX handler.
	 *
	 * Proxies a request to the SaaS backend GET /api/chat/suggestions
	 * to retrieve suggested questions for the chat UI.
	 */
	public function handle_chat_suggestions(): void {
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
			wp_send_json_error(
				array( 'message' => __( 'Store is not connected.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$response = wp_remote_get(
			trailingslashit( $api_url ) . 'api/chat/suggestions',
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
			wp_send_json_error(
				array( 'message' => __( 'Failed to fetch suggestions.', 'woo-ai-analytics' ) )
			);
			return;
		}

		wp_send_json_success( $body['data'] );
	}

	/**
	 * Prevent cloning.
	 */
	private function __clone() {}

	/**
	 * Prevent unserialization.
	 */
	private function __wakeup() {}
}
