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
		add_action( 'wp_ajax_waa_update_grid_layout', array( $this, 'handle_update_grid_layout' ) );
		add_action( 'wp_ajax_waa_generate_report', array( $this, 'handle_generate_report' ) );
		add_action( 'wp_ajax_waa_list_reports', array( $this, 'handle_list_reports' ) );
		add_action( 'wp_ajax_waa_download_report', array( $this, 'handle_download_report' ) );
		add_action( 'wp_ajax_waa_export_csv', array( $this, 'handle_export_csv' ) );
		add_action( 'wp_ajax_waa_create_scheduled_insight', array( $this, 'handle_create_scheduled_insight' ) );
		add_action( 'wp_ajax_waa_list_scheduled_insights', array( $this, 'handle_list_scheduled_insights' ) );
		add_action( 'wp_ajax_waa_update_scheduled_insight', array( $this, 'handle_update_scheduled_insight' ) );
		add_action( 'wp_ajax_waa_delete_scheduled_insight', array( $this, 'handle_delete_scheduled_insight' ) );
		add_action( 'wp_ajax_waa_generate_forecast', array( $this, 'handle_generate_forecast' ) );
		add_action( 'wp_ajax_waa_list_forecasts', array( $this, 'handle_list_forecasts' ) );
		add_action( 'wp_ajax_waa_get_forecast', array( $this, 'handle_get_forecast' ) );
		add_action( 'wp_ajax_waa_delete_forecast', array( $this, 'handle_delete_forecast' ) );
		add_action( 'wp_ajax_waa_generate_comparison', array( $this, 'handle_generate_comparison' ) );
		add_action( 'wp_ajax_waa_list_comparisons', array( $this, 'handle_list_comparisons' ) );
		add_action( 'wp_ajax_waa_get_comparison', array( $this, 'handle_get_comparison' ) );
		add_action( 'wp_ajax_waa_delete_comparison', array( $this, 'handle_delete_comparison' ) );
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
	 * Update grid layout AJAX handler.
	 *
	 * Proxies to PUT /api/dashboards/grid-layout.
	 */
	public function handle_update_grid_layout(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		$items_raw = isset( $_POST['items'] )
			? wp_unslash( $_POST['items'] )
			: '';

		if ( empty( $items_raw ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Layout items are required.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$items = json_decode( $items_raw, true );
		if ( ! is_array( $items ) || empty( $items ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Invalid layout data.', 'woo-ai-analytics' ) )
			);
			return;
		}

		// Sanitize each layout item.
		$sanitized_items = array();
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) || empty( $item['id'] ) ) {
				wp_send_json_error(
					array( 'message' => __( 'Each item must have a valid id.', 'woo-ai-analytics' ) )
				);
				return;
			}
			$sanitized_items[] = array(
				'id'    => sanitize_text_field( $item['id'] ),
				'gridX' => isset( $item['gridX'] ) ? absint( $item['gridX'] ) : 0,
				'gridY' => isset( $item['gridY'] ) ? absint( $item['gridY'] ) : 0,
				'gridW' => isset( $item['gridW'] ) ? absint( $item['gridW'] ) : 6,
				'gridH' => isset( $item['gridH'] ) ? absint( $item['gridH'] ) : 4,
			);
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
			trailingslashit( $api_url ) . 'api/dashboards/grid-layout',
			array(
				'method'  => 'PUT',
				'timeout' => 15,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $auth_token,
				),
				'body'    => wp_json_encode( array( 'items' => $sanitized_items ) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Grid Layout Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to update layout.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( array( 'updated' => true ) );
	}

	/**
	 * Generate PDF report AJAX handler.
	 *
	 * Proxies to POST /api/reports/generate.
	 */
	public function handle_generate_report(): void {
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
				array( 'message' => __( 'Report title is required.', 'woo-ai-analytics' ) )
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
			trailingslashit( $api_url ) . 'api/reports/generate',
			array(
				'timeout' => 60,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $auth_token,
				),
				'body'    => wp_json_encode( array( 'title' => $title ) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Generate Report Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ( 200 !== $status_code && 201 !== $status_code ) || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to generate report.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( self::sanitize_report_response( $body['data'] ) );
	}

	/**
	 * List reports AJAX handler.
	 *
	 * Proxies to GET /api/reports.
	 */
	public function handle_list_reports(): void {
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
			trailingslashit( $api_url ) . 'api/reports',
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA List Reports Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to load reports.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		$reports = array();
		if ( is_array( $body['data']['reports'] ?? null ) ) {
			foreach ( $body['data']['reports'] as $report ) {
				$reports[] = self::sanitize_report_response( $report );
			}
		}
		wp_send_json_success( array( 'reports' => $reports ) );
	}

	/**
	 * Download report AJAX handler.
	 *
	 * Proxies to GET /api/reports/:id/download.
	 * Returns the download URL for the client to open in a new tab.
	 */
	public function handle_download_report(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		$report_id = isset( $_POST['reportId'] )
			? sanitize_text_field( wp_unslash( $_POST['reportId'] ) )
			: '';

		if ( empty( $report_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Report ID is required.', 'woo-ai-analytics' ) )
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
			trailingslashit( $api_url ) . 'api/reports/' . rawurlencode( $report_id ) . '/download',
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Download Report Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );

		if ( 200 !== $status_code ) {
			$body      = json_decode( wp_remote_retrieve_body( $response ), true );
			$error_msg = __( 'Failed to download report.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		// Return PDF as base64 for the client to download.
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		$pdf_base64 = base64_encode( wp_remote_retrieve_body( $response ) );
		wp_send_json_success(
			array(
				'pdfData'  => $pdf_base64,
				'filename' => 'report-' . sanitize_file_name( $report_id ) . '.pdf',
			)
		);
	}

	/**
	 * Export CSV AJAX handler.
	 *
	 * Proxies to POST /api/exports/csv.
	 */
	public function handle_export_csv(): void {
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

		$api_url    = get_option( 'waa_api_url', '' );
		$auth_token = Settings::get_auth_token();

		if ( empty( $api_url ) || empty( $auth_token ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Store is not connected.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$payload = array();
		if ( ! empty( $chart_id ) ) {
			$payload['chartId'] = $chart_id;
		}

		$response = wp_remote_post(
			trailingslashit( $api_url ) . 'api/exports/csv',
			array(
				'timeout' => 30,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $auth_token,
				),
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Export CSV Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code  = wp_remote_retrieve_response_code( $response );
		$content_type = wp_remote_retrieve_header( $response, 'content-type' );

		if ( 200 !== $status_code || false === strpos( $content_type, 'text/csv' ) ) {
			$body      = json_decode( wp_remote_retrieve_body( $response ), true );
			$error_msg = __( 'Failed to export CSV.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		// Return CSV content as base64 for the client to download.
		$csv_body = wp_remote_retrieve_body( $response );
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		$csv_base64 = base64_encode( $csv_body );

		$disposition = wp_remote_retrieve_header( $response, 'content-disposition' );
		$filename    = 'dashboard-export.csv';
		if ( preg_match( '/filename="?([^";\s]+)"?/', $disposition, $matches ) ) {
			$filename = sanitize_file_name( $matches[1] );
		}

		wp_send_json_success(
			array(
				'csvData'  => $csv_base64,
				'filename' => $filename,
			)
		);
	}

	/**
	 * Create scheduled insight AJAX handler.
	 *
	 * Proxies to POST /api/scheduled-insights.
	 */
	public function handle_create_scheduled_insight(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		$name = isset( $_POST['name'] )
			? sanitize_text_field( wp_unslash( $_POST['name'] ) )
			: '';

		if ( empty( $name ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Name is required.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$frequency = isset( $_POST['frequency'] )
			? sanitize_text_field( wp_unslash( $_POST['frequency'] ) )
			: '';

		if ( ! in_array( $frequency, array( 'daily', 'weekly' ), true ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Frequency must be daily or weekly.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$hour = isset( $_POST['hour'] ) ? absint( $_POST['hour'] ) : 0;
		if ( $hour > 23 ) {
			wp_send_json_error(
				array( 'message' => __( 'Hour must be between 0 and 23.', 'woo-ai-analytics' ) )
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
			'name'      => $name,
			'frequency' => $frequency,
			'hour'      => $hour,
		);

		if ( 'weekly' === $frequency && isset( $_POST['dayOfWeek'] ) ) {
			$day_of_week = absint( $_POST['dayOfWeek'] );
			if ( $day_of_week > 6 ) {
				wp_send_json_error(
					array( 'message' => __( 'Day of week must be between 0 and 6.', 'woo-ai-analytics' ) )
				);
				return;
			}
			$payload['dayOfWeek'] = $day_of_week;
		}

		if ( isset( $_POST['enabled'] ) ) {
			$payload['enabled'] = filter_var( $_POST['enabled'], FILTER_VALIDATE_BOOLEAN );
		}

		$response = wp_remote_post(
			trailingslashit( $api_url ) . 'api/scheduled-insights',
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
			error_log( 'WAA Create Scheduled Insight Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ( 200 !== $status_code && 201 !== $status_code ) || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to create scheduled insight.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( self::sanitize_scheduled_insight_response( $body['data'] ) );
	}

	/**
	 * List scheduled insights AJAX handler.
	 *
	 * Proxies to GET /api/scheduled-insights.
	 */
	public function handle_list_scheduled_insights(): void {
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
			trailingslashit( $api_url ) . 'api/scheduled-insights',
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA List Scheduled Insights Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to load scheduled insights.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		$insights = array();
		if ( is_array( $body['data']['insights'] ?? null ) ) {
			foreach ( $body['data']['insights'] as $insight ) {
				$insights[] = self::sanitize_scheduled_insight_response( $insight );
			}
		}
		wp_send_json_success( array( 'insights' => $insights ) );
	}

	/**
	 * Update scheduled insight AJAX handler.
	 *
	 * Proxies to PUT /api/scheduled-insights/:id.
	 */
	public function handle_update_scheduled_insight(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		$insight_id = isset( $_POST['insightId'] )
			? sanitize_text_field( wp_unslash( $_POST['insightId'] ) )
			: '';

		if ( empty( $insight_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Insight ID is required.', 'woo-ai-analytics' ) )
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

		$payload = array();
		if ( isset( $_POST['name'] ) ) {
			$payload['name'] = sanitize_text_field( wp_unslash( $_POST['name'] ) );
		}
		if ( isset( $_POST['frequency'] ) ) {
			$frequency = sanitize_text_field( wp_unslash( $_POST['frequency'] ) );
			if ( ! in_array( $frequency, array( 'daily', 'weekly' ), true ) ) {
				wp_send_json_error(
					array( 'message' => __( 'Frequency must be daily or weekly.', 'woo-ai-analytics' ) )
				);
				return;
			}
			$payload['frequency'] = $frequency;
		}
		if ( isset( $_POST['hour'] ) ) {
			$hour = absint( $_POST['hour'] );
			if ( $hour > 23 ) {
				wp_send_json_error(
					array( 'message' => __( 'Hour must be between 0 and 23.', 'woo-ai-analytics' ) )
				);
				return;
			}
			$payload['hour'] = $hour;
		}
		if ( isset( $_POST['dayOfWeek'] ) ) {
			$day_of_week = absint( $_POST['dayOfWeek'] );
			if ( $day_of_week > 6 ) {
				wp_send_json_error(
					array( 'message' => __( 'Day of week must be between 0 and 6.', 'woo-ai-analytics' ) )
				);
				return;
			}
			$payload['dayOfWeek'] = $day_of_week;
		}
		if ( isset( $_POST['enabled'] ) ) {
			$payload['enabled'] = filter_var( $_POST['enabled'], FILTER_VALIDATE_BOOLEAN );
		}

		$response = wp_remote_request(
			trailingslashit( $api_url ) . 'api/scheduled-insights/' . rawurlencode( $insight_id ),
			array(
				'method'  => 'PUT',
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
			error_log( 'WAA Update Scheduled Insight Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to update scheduled insight.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( self::sanitize_scheduled_insight_response( $body['data'] ) );
	}

	/**
	 * Delete scheduled insight AJAX handler.
	 *
	 * Proxies to DELETE /api/scheduled-insights/:id.
	 */
	public function handle_delete_scheduled_insight(): void {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return;
		}

		$insight_id = isset( $_POST['insightId'] )
			? sanitize_text_field( wp_unslash( $_POST['insightId'] ) )
			: '';

		if ( empty( $insight_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Insight ID is required.', 'woo-ai-analytics' ) )
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
			trailingslashit( $api_url ) . 'api/scheduled-insights/' . rawurlencode( $insight_id ),
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
			error_log( 'WAA Delete Scheduled Insight Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to delete scheduled insight.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( array( 'deleted' => true ) );
	}

	/**
	 * Generate forecast AJAX handler.
	 *
	 * Proxies to POST /api/forecasts.
	 */
	public function handle_generate_forecast(): void {
		$conn = $this->verify_forecast_request();

		$api_url    = $conn['api_url'];
		$auth_token = $conn['auth_token'];

		$days_ahead = isset( $_POST['daysAhead'] ) ? absint( $_POST['daysAhead'] ) : 0;

		if ( ! in_array( $days_ahead, array( 7, 14, 30 ), true ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Days ahead must be 7, 14, or 30.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$payload = array( 'daysAhead' => $days_ahead );

		$response = wp_remote_post(
			trailingslashit( $api_url ) . 'api/forecasts',
			array(
				'timeout' => 30,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $auth_token,
				),
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Generate Forecast Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ( 200 !== $status_code && 201 !== $status_code ) || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to generate forecast.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( self::sanitize_forecast_response( $body['data'] ) );
	}

	/**
	 * List forecasts AJAX handler.
	 *
	 * Proxies to GET /api/forecasts.
	 */
	public function handle_list_forecasts(): void {
		$conn = $this->verify_forecast_request();

		$api_url    = $conn['api_url'];
		$auth_token = $conn['auth_token'];

		$response = wp_remote_get(
			trailingslashit( $api_url ) . 'api/forecasts',
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA List Forecasts Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to load forecasts.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		$forecasts = array();
		if ( is_array( $body['data']['forecasts'] ?? null ) ) {
			foreach ( $body['data']['forecasts'] as $forecast ) {
				$forecasts[] = self::sanitize_forecast_response( $forecast );
			}
		}
		wp_send_json_success( array( 'forecasts' => $forecasts ) );
	}

	/**
	 * Get forecast AJAX handler.
	 *
	 * Proxies to GET /api/forecasts/:id.
	 */
	public function handle_get_forecast(): void {
		$conn        = $this->verify_forecast_request();
		$forecast_id = $this->get_validated_forecast_id();

		$api_url    = $conn['api_url'];
		$auth_token = $conn['auth_token'];

		$response = wp_remote_get(
			trailingslashit( $api_url ) . 'api/forecasts/' . rawurlencode( $forecast_id ),
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Get Forecast Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to load forecast.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( self::sanitize_forecast_response( $body['data'] ) );
	}

	/**
	 * Delete forecast AJAX handler.
	 *
	 * Proxies to DELETE /api/forecasts/:id.
	 */
	public function handle_delete_forecast(): void {
		$conn        = $this->verify_forecast_request();
		$forecast_id = $this->get_validated_forecast_id();

		$api_url    = $conn['api_url'];
		$auth_token = $conn['auth_token'];

		$response = wp_remote_request(
			trailingslashit( $api_url ) . 'api/forecasts/' . rawurlencode( $forecast_id ),
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
			error_log( 'WAA Delete Forecast Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to delete forecast.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( array( 'deleted' => true ) );
	}

	/**
	 * Verify nonce, permissions, and store connection for forecast AJAX handlers.
	 *
	 * @return array{api_url: string, auth_token: string} Connection details on success.
	 */
	private function verify_forecast_request(): array {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return array( 'api_url' => '', 'auth_token' => '' ); // Unreachable; for static analysis.
		}

		$api_url    = get_option( 'waa_api_url', '' );
		$auth_token = Settings::get_auth_token();

		if ( empty( $api_url ) || empty( $auth_token ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Store is not connected.', 'woo-ai-analytics' ) )
			);
			return array( 'api_url' => '', 'auth_token' => '' ); // Unreachable; for static analysis.
		}

		return array(
			'api_url'    => $api_url,
			'auth_token' => $auth_token,
		);
	}

	/**
	 * Validate and extract a forecast ID from the request.
	 *
	 * @return string The validated forecast ID.
	 */
	private function get_validated_forecast_id(): string {
		$forecast_id = isset( $_POST['forecastId'] )
			? sanitize_text_field( wp_unslash( $_POST['forecastId'] ) )
			: '';

		if ( empty( $forecast_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Forecast ID is required.', 'woo-ai-analytics' ) )
			);
			return ''; // Unreachable; for static analysis.
		}

		if ( ! preg_match( '/^[0-9a-fA-F-]{1,64}$/', $forecast_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Invalid forecast ID format.', 'woo-ai-analytics' ) )
			);
			return ''; // Unreachable; for static analysis.
		}

		return $forecast_id;
	}

	/**
	 * Sanitize a revenue forecast response from the backend.
	 *
	 * @param mixed $data Raw forecast data.
	 * @return array Sanitized forecast data.
	 */
	private static function sanitize_forecast_response( $data ): array {
		if ( ! is_array( $data ) ) {
			return array();
		}

		$safe = array(
			'id'             => isset( $data['id'] ) ? sanitize_text_field( $data['id'] ) : '',
			'daysAhead'      => isset( $data['daysAhead'] ) ? absint( $data['daysAhead'] ) : 0,
			'historicalDays' => isset( $data['historicalDays'] ) ? absint( $data['historicalDays'] ) : 0,
			'createdAt'      => isset( $data['createdAt'] ) ? sanitize_text_field( $data['createdAt'] ) : '',
		);

		// Sanitize data points array.
		$safe['dataPoints'] = array();
		if ( isset( $data['dataPoints'] ) && is_array( $data['dataPoints'] ) ) {
			foreach ( $data['dataPoints'] as $point ) {
				if ( ! is_array( $point ) ) {
					continue;
				}
				$safe['dataPoints'][] = array(
					'date'      => isset( $point['date'] ) ? sanitize_text_field( $point['date'] ) : '',
					'predicted' => isset( $point['predicted'] ) ? (float) $point['predicted'] : 0.0,
					'type'      => isset( $point['type'] ) ? sanitize_text_field( $point['type'] ) : 'forecast',
				);
			}
		}

		// Sanitize summary.
		$safe['summary'] = array(
			'avgDailyRevenue' => 0.0,
			'projectedTotal'  => 0.0,
			'trend'           => 'flat',
		);
		if ( isset( $data['summary'] ) && is_array( $data['summary'] ) ) {
			$safe['summary']['avgDailyRevenue'] = isset( $data['summary']['avgDailyRevenue'] )
				? (float) $data['summary']['avgDailyRevenue']
				: 0.0;
			$safe['summary']['projectedTotal'] = isset( $data['summary']['projectedTotal'] )
				? (float) $data['summary']['projectedTotal']
				: 0.0;
			$trend = isset( $data['summary']['trend'] )
				? sanitize_text_field( $data['summary']['trend'] )
				: 'flat';
			$safe['summary']['trend'] = in_array( $trend, array( 'up', 'down', 'flat' ), true )
				? $trend
				: 'flat';
		}

		return $safe;
	}

	/**
	 * Sanitize a scheduled insight response from the backend.
	 *
	 * @param mixed $data Raw insight data.
	 * @return array Sanitized insight data.
	 */
	private static function sanitize_scheduled_insight_response( $data ): array {
		if ( ! is_array( $data ) ) {
			return array();
		}

		return array(
			'id'        => isset( $data['id'] ) ? sanitize_text_field( $data['id'] ) : '',
			'name'      => isset( $data['name'] ) ? sanitize_text_field( $data['name'] ) : '',
			'frequency' => isset( $data['frequency'] ) ? sanitize_text_field( $data['frequency'] ) : '',
			'hour'      => isset( $data['hour'] ) ? absint( $data['hour'] ) : 0,
			'dayOfWeek' => isset( $data['dayOfWeek'] ) ? ( is_null( $data['dayOfWeek'] ) ? null : absint( $data['dayOfWeek'] ) ) : null,
			'enabled'   => isset( $data['enabled'] ) ? (bool) $data['enabled'] : true,
			'lastRunAt' => isset( $data['lastRunAt'] ) ? sanitize_text_field( $data['lastRunAt'] ) : null,
			'nextRunAt' => isset( $data['nextRunAt'] ) ? sanitize_text_field( $data['nextRunAt'] ) : null,
			'createdAt' => isset( $data['createdAt'] ) ? sanitize_text_field( $data['createdAt'] ) : '',
			'updatedAt' => isset( $data['updatedAt'] ) ? sanitize_text_field( $data['updatedAt'] ) : '',
		);
	}

	/**
	 * Sanitize a report response from the backend.
	 *
	 * @param mixed $data Raw report data.
	 * @return array Sanitized report data.
	 */
	private static function sanitize_report_response( $data ): array {
		if ( ! is_array( $data ) ) {
			return array();
		}

		return array(
			'id'         => isset( $data['id'] ) ? sanitize_text_field( $data['id'] ) : '',
			'title'      => isset( $data['title'] ) ? sanitize_text_field( $data['title'] ) : '',
			'status'     => isset( $data['status'] ) ? sanitize_text_field( $data['status'] ) : '',
			'chartCount' => isset( $data['chartCount'] ) ? absint( $data['chartCount'] ) : 0,
			'createdAt'  => isset( $data['createdAt'] ) ? sanitize_text_field( $data['createdAt'] ) : '',
		);
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
			'gridX'         => isset( $data['gridX'] ) ? absint( $data['gridX'] ) : 0,
			'gridY'         => isset( $data['gridY'] ) ? absint( $data['gridY'] ) : 0,
			'gridW'         => isset( $data['gridW'] ) ? absint( $data['gridW'] ) : 6,
			'gridH'         => isset( $data['gridH'] ) ? absint( $data['gridH'] ) : 4,
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

	// ─── Date Range Comparison AJAX Handlers ─────────────────────────────────────

	/**
	 * Generate comparison AJAX handler.
	 *
	 * Proxies to POST /api/comparisons.
	 */
	public function handle_generate_comparison(): void {
		$conn = $this->verify_comparison_request();

		$api_url    = $conn['api_url'];
		$auth_token = $conn['auth_token'];

		$payload = array();

		if ( ! empty( $_POST['preset'] ) ) {
			$preset = sanitize_text_field( wp_unslash( $_POST['preset'] ) );
			$valid  = array( 'today', 'this_week', 'this_month', 'this_year', 'last_7_days', 'last_30_days' );
			if ( ! in_array( $preset, $valid, true ) ) {
				wp_send_json_error(
					array( 'message' => __( 'Invalid comparison preset.', 'woo-ai-analytics' ) )
				);
				return;
			}
			$payload['preset'] = $preset;
		} else {
			$current_start  = isset( $_POST['currentStart'] ) ? sanitize_text_field( wp_unslash( $_POST['currentStart'] ) ) : '';
			$current_end    = isset( $_POST['currentEnd'] ) ? sanitize_text_field( wp_unslash( $_POST['currentEnd'] ) ) : '';
			$previous_start = isset( $_POST['previousStart'] ) ? sanitize_text_field( wp_unslash( $_POST['previousStart'] ) ) : '';
			$previous_end   = isset( $_POST['previousEnd'] ) ? sanitize_text_field( wp_unslash( $_POST['previousEnd'] ) ) : '';

			if ( empty( $current_start ) || empty( $current_end ) || empty( $previous_start ) || empty( $previous_end ) ) {
				wp_send_json_error(
					array( 'message' => __( 'All date range fields are required.', 'woo-ai-analytics' ) )
				);
				return;
			}

			$date_pattern = '/^\d{4}-\d{2}-\d{2}/';
			if ( ! preg_match( $date_pattern, $current_start ) || ! preg_match( $date_pattern, $current_end )
				|| ! preg_match( $date_pattern, $previous_start ) || ! preg_match( $date_pattern, $previous_end ) ) {
				wp_send_json_error(
					array( 'message' => __( 'Invalid date format. Use YYYY-MM-DD.', 'woo-ai-analytics' ) )
				);
				return;
			}

			$payload['currentStart']  = $current_start;
			$payload['currentEnd']    = $current_end;
			$payload['previousStart'] = $previous_start;
			$payload['previousEnd']   = $previous_end;
		}

		$response = wp_remote_post(
			trailingslashit( $api_url ) . 'api/comparisons',
			array(
				'timeout' => 30,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $auth_token,
				),
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Generate Comparison Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( ( 200 !== $status_code && 201 !== $status_code ) || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to generate comparison.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( self::sanitize_comparison_response( $body['data'] ) );
	}

	/**
	 * List comparisons AJAX handler.
	 *
	 * Proxies to GET /api/comparisons.
	 */
	public function handle_list_comparisons(): void {
		$conn = $this->verify_comparison_request();

		$api_url    = $conn['api_url'];
		$auth_token = $conn['auth_token'];

		$response = wp_remote_get(
			trailingslashit( $api_url ) . 'api/comparisons',
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA List Comparisons Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to load comparisons.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		$comparisons = array();
		if ( is_array( $body['data']['comparisons'] ?? null ) ) {
			foreach ( $body['data']['comparisons'] as $comparison ) {
				$comparisons[] = self::sanitize_comparison_response( $comparison );
			}
		}
		wp_send_json_success( array( 'comparisons' => $comparisons ) );
	}

	/**
	 * Get comparison AJAX handler.
	 *
	 * Proxies to GET /api/comparisons/:id.
	 */
	public function handle_get_comparison(): void {
		$conn          = $this->verify_comparison_request();
		$comparison_id = $this->get_validated_comparison_id();

		$api_url    = $conn['api_url'];
		$auth_token = $conn['auth_token'];

		$response = wp_remote_get(
			trailingslashit( $api_url ) . 'api/comparisons/' . rawurlencode( $comparison_id ),
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => 'Bearer ' . $auth_token,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			error_log( 'WAA Get Comparison Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to load comparison.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( self::sanitize_comparison_response( $body['data'] ) );
	}

	/**
	 * Delete comparison AJAX handler.
	 *
	 * Proxies to DELETE /api/comparisons/:id.
	 */
	public function handle_delete_comparison(): void {
		$conn          = $this->verify_comparison_request();
		$comparison_id = $this->get_validated_comparison_id();

		$api_url    = $conn['api_url'];
		$auth_token = $conn['auth_token'];

		$response = wp_remote_request(
			trailingslashit( $api_url ) . 'api/comparisons/' . rawurlencode( $comparison_id ),
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
			error_log( 'WAA Delete Comparison Error: ' . $response->get_error_message() );
			wp_send_json_error(
				array( 'message' => __( 'Unable to connect to analytics service.', 'woo-ai-analytics' ) )
			);
			return;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( 200 !== $status_code || ! is_array( $body ) || empty( $body['success'] ) ) {
			$error_msg = __( 'Failed to delete comparison.', 'woo-ai-analytics' );
			if ( is_array( $body ) && ! empty( $body['error']['message'] ) ) {
				$error_msg = sanitize_text_field( $body['error']['message'] );
			}
			wp_send_json_error( array( 'message' => $error_msg ) );
			return;
		}

		wp_send_json_success( array( 'deleted' => true ) );
	}

	/**
	 * Verify nonce, permissions, and store connection for comparison AJAX handlers.
	 *
	 * @return array{api_url: string, auth_token: string} Connection details on success.
	 */
	private function verify_comparison_request(): array {
		check_ajax_referer( 'waa_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Permission denied.', 'woo-ai-analytics' ) ),
				403
			);
			return array( 'api_url' => '', 'auth_token' => '' ); // Unreachable; for static analysis.
		}

		$api_url    = get_option( 'waa_api_url', '' );
		$auth_token = Settings::get_auth_token();

		if ( empty( $api_url ) || empty( $auth_token ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Store is not connected.', 'woo-ai-analytics' ) )
			);
			return array( 'api_url' => '', 'auth_token' => '' ); // Unreachable; for static analysis.
		}

		return array(
			'api_url'    => $api_url,
			'auth_token' => $auth_token,
		);
	}

	/**
	 * Validate and extract a comparison ID from the request.
	 *
	 * @return string The validated comparison ID.
	 */
	private function get_validated_comparison_id(): string {
		$comparison_id = isset( $_POST['comparisonId'] )
			? sanitize_text_field( wp_unslash( $_POST['comparisonId'] ) )
			: '';

		if ( empty( $comparison_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Comparison ID is required.', 'woo-ai-analytics' ) )
			);
			return ''; // Unreachable; for static analysis.
		}

		if ( ! preg_match( '/^[0-9a-fA-F-]{1,64}$/', $comparison_id ) ) {
			wp_send_json_error(
				array( 'message' => __( 'Invalid comparison ID format.', 'woo-ai-analytics' ) )
			);
			return ''; // Unreachable; for static analysis.
		}

		return $comparison_id;
	}

	/**
	 * Sanitize a date range comparison response from the backend.
	 *
	 * @param mixed $data Raw comparison data.
	 * @return array Sanitized comparison data.
	 */
	private static function sanitize_comparison_response( $data ): array {
		if ( ! is_array( $data ) ) {
			return array();
		}

		$safe = array(
			'id'            => isset( $data['id'] ) ? sanitize_text_field( $data['id'] ) : '',
			'preset'        => isset( $data['preset'] ) ? sanitize_text_field( (string) $data['preset'] ) : null,
			'currentStart'  => isset( $data['currentStart'] ) ? sanitize_text_field( $data['currentStart'] ) : '',
			'currentEnd'    => isset( $data['currentEnd'] ) ? sanitize_text_field( $data['currentEnd'] ) : '',
			'previousStart' => isset( $data['previousStart'] ) ? sanitize_text_field( $data['previousStart'] ) : '',
			'previousEnd'   => isset( $data['previousEnd'] ) ? sanitize_text_field( $data['previousEnd'] ) : '',
			'createdAt'     => isset( $data['createdAt'] ) ? sanitize_text_field( $data['createdAt'] ) : '',
		);

		// Sanitize metrics.
		$safe['metrics'] = array(
			'current'                 => array( 'revenue' => 0.0, 'orderCount' => 0, 'avgOrderValue' => 0.0 ),
			'previous'                => array( 'revenue' => 0.0, 'orderCount' => 0, 'avgOrderValue' => 0.0 ),
			'revenueChange'           => 0.0,
			'revenueChangePercent'    => 0.0,
			'orderCountChange'        => 0,
			'orderCountChangePercent' => 0.0,
			'aovChange'               => 0.0,
			'aovChangePercent'        => 0.0,
			'trend'                   => 'flat',
		);
		if ( isset( $data['metrics'] ) && is_array( $data['metrics'] ) ) {
			$m = $data['metrics'];

			// Current period metrics.
			if ( isset( $m['current'] ) && is_array( $m['current'] ) ) {
				$safe['metrics']['current'] = array(
					'revenue'       => isset( $m['current']['revenue'] ) ? (float) $m['current']['revenue'] : 0.0,
					'orderCount'    => isset( $m['current']['orderCount'] ) ? (int) $m['current']['orderCount'] : 0,
					'avgOrderValue' => isset( $m['current']['avgOrderValue'] ) ? (float) $m['current']['avgOrderValue'] : 0.0,
				);
			}

			// Previous period metrics.
			if ( isset( $m['previous'] ) && is_array( $m['previous'] ) ) {
				$safe['metrics']['previous'] = array(
					'revenue'       => isset( $m['previous']['revenue'] ) ? (float) $m['previous']['revenue'] : 0.0,
					'orderCount'    => isset( $m['previous']['orderCount'] ) ? (int) $m['previous']['orderCount'] : 0,
					'avgOrderValue' => isset( $m['previous']['avgOrderValue'] ) ? (float) $m['previous']['avgOrderValue'] : 0.0,
				);
			}

			$safe['metrics']['revenueChange']           = isset( $m['revenueChange'] ) ? (float) $m['revenueChange'] : 0.0;
			$safe['metrics']['revenueChangePercent']     = isset( $m['revenueChangePercent'] ) ? (float) $m['revenueChangePercent'] : 0.0;
			$safe['metrics']['orderCountChange']         = isset( $m['orderCountChange'] ) ? (int) $m['orderCountChange'] : 0;
			$safe['metrics']['orderCountChangePercent']  = isset( $m['orderCountChangePercent'] ) ? (float) $m['orderCountChangePercent'] : 0.0;
			$safe['metrics']['aovChange']                = isset( $m['aovChange'] ) ? (float) $m['aovChange'] : 0.0;
			$safe['metrics']['aovChangePercent']         = isset( $m['aovChangePercent'] ) ? (float) $m['aovChangePercent'] : 0.0;

			$trend = isset( $m['trend'] ) ? sanitize_text_field( $m['trend'] ) : 'flat';
			$safe['metrics']['trend'] = in_array( $trend, array( 'up', 'down', 'flat' ), true ) ? $trend : 'flat';
		}

		// Sanitize breakdown array.
		$safe['breakdown'] = array();
		if ( isset( $data['breakdown'] ) && is_array( $data['breakdown'] ) ) {
			foreach ( $data['breakdown'] as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$safe['breakdown'][] = array(
					'date'            => isset( $row['date'] ) ? sanitize_text_field( $row['date'] ) : '',
					'currentRevenue'  => isset( $row['currentRevenue'] ) ? (float) $row['currentRevenue'] : 0.0,
					'previousRevenue' => isset( $row['previousRevenue'] ) ? (float) $row['previousRevenue'] : 0.0,
				);
			}
		}

		return $safe;
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
