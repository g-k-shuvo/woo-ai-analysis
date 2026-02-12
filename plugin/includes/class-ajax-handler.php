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
 * Handles chat and dashboard AJAX endpoints.
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
		add_action( 'wp_ajax_waa_save_chart', array( $this, 'handle_save_chart' ) );
		add_action( 'wp_ajax_waa_list_charts', array( $this, 'handle_list_charts' ) );
		add_action( 'wp_ajax_waa_delete_chart', array( $this, 'handle_delete_chart' ) );
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
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Backend Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
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

		wp_send_json_success( self::sanitize_chat_response( $body['data'] ) );
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
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Suggestions Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to fetch suggestions.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		$suggestions = array();
		if ( is_array( $body['data']['suggestions'] ?? null ) ) {
			foreach ( $body['data']['suggestions'] as $suggestion ) {
				$suggestions[] = sanitize_text_field( $suggestion );
			}
		}
		wp_send_json_success( array( 'suggestions' => $suggestions ) );
	}

	/**
	 * Save chart to dashboard AJAX handler.
	 *
	 * Proxies to POST /api/dashboards/charts.
	 */
	public function handle_save_chart(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		$title = isset( $_POST['title'] )
			? sanitize_text_field( wp_unslash( $_POST['title'] ) )
			: '';

		if ( empty( $title ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Title is required.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$query_text  = isset( $_POST['queryText'] )
			? sanitize_text_field( wp_unslash( $_POST['queryText'] ) )
			: '';

		$chart_config_raw = isset( $_POST['chartConfig'] )
			? wp_unslash( $_POST['chartConfig'] )
			: '';

		if ( empty( $chart_config_raw ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Chart configuration is required.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$chart_config = json_decode( $chart_config_raw, true );
		if ( ! is_array( $chart_config ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Invalid chart configuration.', 'woo-ai-analytics' ) )
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

		$payload = array(
			'title'       => $title,
			'chartConfig' => $chart_config,
		);
		if ( ! empty( $query_text ) ) {
			$payload['queryText'] = $query_text;
		}

		$response = wp_remote_post(
			trailingslashit( $api_url ) . 'api/dashboards/charts',
			array(
				'timeout' => 15,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $auth_token,
				),
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Save Chart Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ( 200 !== $status_code && 201 !== $status_code ) || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to save chart.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( self::sanitize_chart_response( $body['data'] ) );
	}

	/**
	 * List saved charts AJAX handler.
	 *
	 * Proxies to GET /api/dashboards/charts.
	 */
	public function handle_list_charts(): void {
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
			trailingslashit( $api_url ) . 'api/dashboards/charts',
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA List Charts Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to load dashboard.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		$charts = array();
		if ( is_array( $body['data']['charts'] ?? null ) ) {
			foreach ( $body['data']['charts'] as $chart ) {
				$charts[] = self::sanitize_chart_response( $chart );
			}
		}
		wp_send_json_success( array( 'charts' => $charts ) );
	}

	/**
	 * Delete saved chart AJAX handler.
	 *
	 * Proxies to DELETE /api/dashboards/charts/:id.
	 */
	public function handle_delete_chart(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		$chart_id = isset( $_POST['chartId'] )
			? sanitize_text_field( wp_unslash( $_POST['chartId'] ) )
			: '';

		if ( empty( $chart_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Chart ID is required.', 'woo-ai-analytics' ) )
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

		$response = wp_remote_request(
			trailingslashit( $api_url ) . 'api/dashboards/charts/' . rawurlencode( $chart_id ),
			array(
				'method'  => 'DELETE',
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Delete Chart Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to delete chart.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( array( 'deleted' => true ) );
	}

	/**
	 * Sanitize a single saved chart response from the backend.
	 *
	 * @param mixed $data Raw chart data.
	 * @return array Sanitized chart data.
	 */
	private static function sanitize_chart_response( $data ): array {
		if ( ! is_array( $data ) ) {
			return array();
		}

		$safe = array(
			'id'            => isset( $data['id'] ) ? sanitize_text_field( $data['id'] ) : '',
			'title'         => isset( $data['title'] ) ? sanitize_text_field( $data['title'] ) : '',
			'queryText'     => isset( $data['queryText'] ) ? sanitize_text_field( $data['queryText'] ) : '',
			'positionIndex' => isset( $data['positionIndex'] ) ? absint( $data['positionIndex'] ) : 0,
			'createdAt'     => isset( $data['createdAt'] ) ? sanitize_text_field( $data['createdAt'] ) : '',
			'updatedAt'     => isset( $data['updatedAt'] ) ? sanitize_text_field( $data['updatedAt'] ) : '',
		);

		if ( isset( $data['chartConfig'] ) && is_array( $data['chartConfig'] ) ) {
			$safe['chartConfig'] = self::sanitize_chart_config( $data['chartConfig'] );
		} else {
			$safe['chartConfig'] = null;
		}

		return $safe;
	}

	/**
	 * Sanitize the chat response data from the SaaS backend.
	 *
	 * @param mixed $data Raw response data.
	 * @return array Sanitized response.
	 */
	private static function sanitize_chat_response( $data ): array {
		if ( ! is_array( $data ) ) {
			return array();
		}

		$safe = array(
			'answer'     => isset( $data['answer'] ) ? sanitize_text_field( $data['answer'] ) : '',
			'sql'        => isset( $data['sql'] ) ? sanitize_text_field( $data['sql'] ) : '',
			'rowCount'   => isset( $data['rowCount'] ) ? absint( $data['rowCount'] ) : 0,
			'durationMs' => isset( $data['durationMs'] ) ? absint( $data['durationMs'] ) : 0,
		);

		// Sanitize chart config if present.
		if ( isset( $data['chartConfig'] ) && is_array( $data['chartConfig'] ) ) {
			$safe['chartConfig'] = self::sanitize_chart_config( $data['chartConfig'] );
		} else {
			$safe['chartConfig'] = null;
		}

		return $safe;
	}

	/**
	 * Sanitize a chart config object recursively.
	 *
	 * @param array $config Raw chart config.
	 * @return array Sanitized chart config.
	 */
	private static function sanitize_chart_config( array $config ): array {
		return self::sanitize_recursive( $config );
	}

	/**
	 * Recursively sanitize an array — sanitize strings, keep numbers/bools, recurse arrays.
	 *
	 * @param array $data Input data.
	 * @return array Sanitized data.
	 */
	private static function sanitize_recursive( array $data ): array {
		$result = array();
		foreach ( $data as $key => $value ) {
			$safe_key = is_string( $key ) ? sanitize_text_field( $key ) : $key;
			if ( is_array( $value ) ) {
				$result[ $safe_key ] = self::sanitize_recursive( $value );
			} elseif ( is_string( $value ) ) {
				$result[ $safe_key ] = sanitize_text_field( $value );
			} elseif ( is_int( $value ) || is_float( $value ) || is_bool( $value ) || is_null( $value ) ) {
				$result[ $safe_key ] = $value;
			}
		}
		return $result;
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
