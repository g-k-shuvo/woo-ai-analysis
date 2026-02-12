<?php
/**
 * Unit tests for report AJAX handlers in Ajax_Handler.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics\Tests\Unit;

use PHPUnit\Framework\TestCase;
use WP_Ajax_Response_Exception;
use WP_Error;
use WP_Stubs;
use WooAIAnalytics\Ajax_Handler;
use WooAIAnalytics\Settings;
use ReflectionClass;

/**
 * Tests for Ajax_Handler report endpoints (generate/list/download reports).
 */
final class ReportAjaxTest extends TestCase {

	private Ajax_Handler $handler;

	protected function setUp(): void {
		parent::setUp();
		WP_Stubs::reset();

		// Reset singleton so constructor hooks re-register.
		$ref  = new ReflectionClass( Ajax_Handler::class );
		$prop = $ref->getProperty( 'instance' );
		$prop->setAccessible( true );
		$prop->setValue( null, null );

		$this->handler = Ajax_Handler::get_instance();

		// Default: store is connected.
		WP_Stubs::$options['waa_api_url']      = 'https://api.example.com';
		WP_Stubs::$options['waa_store_api_key'] = $this->make_encrypted_key( 'test-api-key-12345' );
	}

	protected function tearDown(): void {
		WP_Stubs::reset();
		$_POST = array();
		parent::tearDown();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	private function make_encrypted_key( string $plain_key ): string {
		$key    = hash( 'sha256', wp_salt( 'auth' ), true );
		$iv     = openssl_random_pseudo_bytes( 16 );
		$cipher = openssl_encrypt( $plain_key, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv );
		return base64_encode( $iv . $cipher );
	}

	private function call_handler( string $method ): WP_Ajax_Response_Exception {
		try {
			$this->handler->$method();
		} catch ( WP_Ajax_Response_Exception $e ) {
			return $e;
		}
		$this->fail( "Expected WP_Ajax_Response_Exception from {$method}" );
	}

	private function make_response( int $code, array $body ): array {
		return array(
			'response' => array( 'code' => $code, 'message' => 'OK' ),
			'body'     => (string) json_encode( $body ),
		);
	}

	/**
	 * Build a raw HTTP response with an arbitrary string body (for PDF binary).
	 */
	private function make_raw_response( int $code, string $raw_body ): array {
		return array(
			'response' => array( 'code' => $code, 'message' => 'OK' ),
			'body'     => $raw_body,
		);
	}

	/**
	 * Return a sample report data array for backend responses.
	 */
	private function sample_report( array $overrides = array() ): array {
		return array_merge(
			array(
				'id'         => 'rpt-abc-123',
				'title'      => 'Monthly Revenue Report',
				'status'     => 'completed',
				'chartCount' => 3,
				'createdAt'  => '2026-02-12T10:00:00Z',
			),
			$overrides
		);
	}

	// ─── Action Registration ─────────────────────────────────────────────────────

	public function test_registers_generate_report_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_generate_report'
		);

		$this->assertNotEmpty( $hooks, 'waa_generate_report action should be registered' );
	}

	public function test_registers_list_reports_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_list_reports'
		);

		$this->assertNotEmpty( $hooks, 'waa_list_reports action should be registered' );
	}

	public function test_registers_download_report_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_download_report'
		);

		$this->assertNotEmpty( $hooks, 'waa_download_report action should be registered' );
	}

	// ─── handle_generate_report — Nonce & Permission ─────────────────────────────

	public function test_generate_report_checks_nonce(): void {
		$_POST['title'] = 'Q1 Revenue';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array(
				'success' => true,
				'data'    => $this->sample_report( array( 'title' => 'Q1 Revenue' ) ),
			)
		);

		$this->call_handler( 'handle_generate_report' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_generate_report_rejects_no_permission(): void {
		$_POST['title'] = 'Q1 Revenue';

		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	// ─── handle_generate_report — Input Validation ───────────────────────────────

	public function test_generate_report_rejects_missing_title(): void {
		// No $_POST['title'] set at all.
		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Report title is required.', $e->data['message'] );
	}

	public function test_generate_report_rejects_empty_title(): void {
		$_POST['title'] = '';

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Report title is required.', $e->data['message'] );
	}

	// ─── handle_generate_report — Store Not Connected ────────────────────────────

	public function test_generate_report_fails_when_no_api_url(): void {
		$_POST['title'] = 'Revenue Report';

		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	public function test_generate_report_fails_when_no_auth_token(): void {
		$_POST['title'] = 'Revenue Report';

		// Remove the encrypted key so auth token resolves to empty.
		unset( WP_Stubs::$options['waa_store_api_key'] );

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	// ─── handle_generate_report — Backend Errors ─────────────────────────────────

	public function test_generate_report_handles_wp_error(): void {
		$_POST['title'] = 'Revenue Report';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => new WP_Error( 'timeout', 'Connection timed out' );

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_generate_report_handles_non_200_201_status(): void {
		$_POST['title'] = 'Revenue Report';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			500,
			array(
				'success' => false,
				'error'   => array( 'message' => 'Internal server error' ),
			)
		);

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Internal server error', $e->data['message'] );
	}

	public function test_generate_report_handles_non_success_response(): void {
		$_POST['title'] = 'Revenue Report';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			200,
			array(
				'success' => false,
				'error'   => array( 'message' => 'Report generation failed' ),
			)
		);

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Report generation failed', $e->data['message'] );
	}

	public function test_generate_report_uses_default_error_when_no_error_message(): void {
		$_POST['title'] = 'Revenue Report';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			400,
			array( 'success' => false )
		);

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Failed to generate report.', $e->data['message'] );
	}

	// ─── handle_generate_report — Successful Generation ──────────────────────────

	public function test_generate_report_returns_sanitized_report_on_201(): void {
		$_POST['title'] = 'Monthly Revenue';

		$report = $this->sample_report( array( 'title' => 'Monthly Revenue' ) );

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array( 'success' => true, 'data' => $report )
		);

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertTrue( $e->success );
		$this->assertSame( 'rpt-abc-123', $e->data['id'] );
		$this->assertSame( 'Monthly Revenue', $e->data['title'] );
		$this->assertSame( 'completed', $e->data['status'] );
		$this->assertSame( 3, $e->data['chartCount'] );
		$this->assertSame( '2026-02-12T10:00:00Z', $e->data['createdAt'] );
	}

	public function test_generate_report_returns_sanitized_report_on_200(): void {
		$_POST['title'] = 'Weekly Summary';

		$report = $this->sample_report( array( 'title' => 'Weekly Summary', 'status' => 'pending' ) );

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => $report )
		);

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertTrue( $e->success );
		$this->assertSame( 'Weekly Summary', $e->data['title'] );
		$this->assertSame( 'pending', $e->data['status'] );
	}

	public function test_generate_report_sends_correct_request(): void {
		$_POST['title'] = 'Q1 Revenue';

		$captured_url  = null;
		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_url, &$captured_args ) {
			$captured_url  = $url;
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 201, 'message' => 'Created' ),
				'body'     => json_encode( array(
					'success' => true,
					'data'    => $this->sample_report( array( 'title' => 'Q1 Revenue' ) ),
				) ),
			);
		};

		$this->call_handler( 'handle_generate_report' );

		// Verify URL.
		$this->assertSame( 'https://api.example.com/api/reports/generate', $captured_url );

		// Verify headers.
		$this->assertSame( 'application/json', $captured_args['headers']['Content-Type'] );
		$this->assertStringStartsWith( 'Bearer ', $captured_args['headers']['Authorization'] );

		// Verify body.
		$body = json_decode( $captured_args['body'], true );
		$this->assertSame( 'Q1 Revenue', $body['title'] );

		// Verify timeout.
		$this->assertSame( 60, $captured_args['timeout'] );
	}

	// ─── handle_list_reports — Nonce & Permission ────────────────────────────────

	public function test_list_reports_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'reports' => array() ) )
		);

		$this->call_handler( 'handle_list_reports' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_list_reports_rejects_no_permission(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_list_reports' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	// ─── handle_list_reports — Store Not Connected ───────────────────────────────

	public function test_list_reports_fails_when_not_connected(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_list_reports' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	// ─── handle_list_reports — Backend Errors ────────────────────────────────────

	public function test_list_reports_handles_wp_error(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'http_request_failed', 'cURL error 28' );

		$e = $this->call_handler( 'handle_list_reports' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_list_reports_handles_non_200_status(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			500,
			array( 'success' => false, 'error' => array( 'message' => 'Database error' ) )
		);

		$e = $this->call_handler( 'handle_list_reports' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Database error', $e->data['message'] );
	}

	public function test_list_reports_uses_default_error_when_no_error_message(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			503,
			array( 'success' => false )
		);

		$e = $this->call_handler( 'handle_list_reports' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Failed to load reports.', $e->data['message'] );
	}

	// ─── handle_list_reports — Success ───────────────────────────────────────────

	public function test_list_reports_returns_sanitized_reports(): void {
		$reports = array(
			$this->sample_report(),
			$this->sample_report( array(
				'id'         => 'rpt-def-456',
				'title'      => 'Product Performance',
				'status'     => 'pending',
				'chartCount' => 5,
				'createdAt'  => '2026-02-11T08:00:00Z',
			) ),
		);

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'reports' => $reports ) )
		);

		$e = $this->call_handler( 'handle_list_reports' );

		$this->assertTrue( $e->success );
		$this->assertCount( 2, $e->data['reports'] );
		$this->assertSame( 'rpt-abc-123', $e->data['reports'][0]['id'] );
		$this->assertSame( 'Monthly Revenue Report', $e->data['reports'][0]['title'] );
		$this->assertSame( 'rpt-def-456', $e->data['reports'][1]['id'] );
		$this->assertSame( 'Product Performance', $e->data['reports'][1]['title'] );
		$this->assertSame( 5, $e->data['reports'][1]['chartCount'] );
	}

	public function test_list_reports_returns_empty_array_when_no_reports(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'reports' => array() ) )
		);

		$e = $this->call_handler( 'handle_list_reports' );

		$this->assertTrue( $e->success );
		$this->assertSame( array(), $e->data['reports'] );
	}

	public function test_list_reports_sanitizes_all_report_fields(): void {
		$malicious_report = array(
			'id'         => '<script>alert("xss")</script>rpt-evil',
			'title'      => '<b>Injected</b> Title',
			'status'     => '<img src=x onerror=alert(1)>completed',
			'chartCount' => 3,
			'createdAt'  => '<em>2026-02-12</em>',
		);

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'reports' => array( $malicious_report ) ) )
		);

		$e = $this->call_handler( 'handle_list_reports' );

		$this->assertTrue( $e->success );
		$report = $e->data['reports'][0];
		$this->assertStringNotContainsString( '<script>', $report['id'] );
		$this->assertStringNotContainsString( '<b>', $report['title'] );
		$this->assertStringNotContainsString( '<img', $report['status'] );
		$this->assertStringNotContainsString( '<em>', $report['createdAt'] );
	}

	public function test_list_reports_handles_missing_reports_key(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array() )
		);

		$e = $this->call_handler( 'handle_list_reports' );

		$this->assertTrue( $e->success );
		$this->assertSame( array(), $e->data['reports'] );
	}

	// ─── handle_download_report — Nonce & Permission ─────────────────────────────

	public function test_download_report_checks_nonce(): void {
		$_POST['reportId'] = 'rpt-abc-123';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_raw_response(
			200,
			'%PDF-1.4 fake pdf content'
		);

		$this->call_handler( 'handle_download_report' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_download_report_rejects_no_permission(): void {
		$_POST['reportId'] = 'rpt-abc-123';

		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_download_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	// ─── handle_download_report — Input Validation ───────────────────────────────

	public function test_download_report_rejects_missing_report_id(): void {
		// No $_POST['reportId'] set.
		$e = $this->call_handler( 'handle_download_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Report ID is required.', $e->data['message'] );
	}

	public function test_download_report_rejects_empty_report_id(): void {
		$_POST['reportId'] = '';

		$e = $this->call_handler( 'handle_download_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Report ID is required.', $e->data['message'] );
	}

	// ─── handle_download_report — Store Not Connected ────────────────────────────

	public function test_download_report_fails_when_not_connected(): void {
		$_POST['reportId'] = 'rpt-abc-123';

		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_download_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	// ─── handle_download_report — Backend Errors ─────────────────────────────────

	public function test_download_report_handles_wp_error(): void {
		$_POST['reportId'] = 'rpt-abc-123';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'timeout', 'Connection timed out' );

		$e = $this->call_handler( 'handle_download_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_download_report_handles_non_200_status(): void {
		$_POST['reportId'] = 'rpt-abc-123';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			404,
			array( 'success' => false, 'error' => array( 'message' => 'Report not found' ) )
		);

		$e = $this->call_handler( 'handle_download_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Report not found', $e->data['message'] );
	}

	public function test_download_report_uses_default_error_when_no_error_message(): void {
		$_POST['reportId'] = 'rpt-abc-123';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			500,
			array( 'success' => false )
		);

		$e = $this->call_handler( 'handle_download_report' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Failed to download report.', $e->data['message'] );
	}

	// ─── handle_download_report — Success ────────────────────────────────────────

	public function test_download_report_returns_base64_pdf_data(): void {
		$_POST['reportId'] = 'rpt-abc-123';

		$pdf_content = '%PDF-1.4 fake pdf binary content here';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_raw_response(
			200,
			$pdf_content
		);

		$e = $this->call_handler( 'handle_download_report' );

		$this->assertTrue( $e->success );
		$this->assertSame( base64_encode( $pdf_content ), $e->data['pdfData'] );
	}

	public function test_download_report_returns_correct_filename(): void {
		$_POST['reportId'] = 'rpt-abc-123';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_raw_response(
			200,
			'%PDF-1.4 content'
		);

		$e = $this->call_handler( 'handle_download_report' );

		$this->assertTrue( $e->success );
		$this->assertSame( 'report-rpt-abc-123.pdf', $e->data['filename'] );
	}

	public function test_download_report_sanitizes_report_id_in_filename(): void {
		$_POST['reportId'] = 'rpt-<script>alert(1)</script>';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_raw_response(
			200,
			'%PDF-1.4 content'
		);

		$e = $this->call_handler( 'handle_download_report' );

		$this->assertTrue( $e->success );
		// sanitize_file_name should strip dangerous characters like < > ( ) ;.
		$this->assertStringNotContainsString( '<', $e->data['filename'] );
		$this->assertStringNotContainsString( '>', $e->data['filename'] );
		$this->assertStringNotContainsString( '(', $e->data['filename'] );
		$this->assertStringStartsWith( 'report-', $e->data['filename'] );
		$this->assertStringEndsWith( '.pdf', $e->data['filename'] );
	}

	public function test_download_report_sends_correct_request_url(): void {
		$_POST['reportId'] = 'rpt-xyz-789';

		$captured_url = null;
		WP_Stubs::$overrides['wp_remote_get'] = function ( $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => '%PDF-1.4 content',
			);
		};

		$this->call_handler( 'handle_download_report' );

		$this->assertStringContainsString( 'api/reports/rpt-xyz-789/download', $captured_url );
	}

	public function test_download_report_sends_authorization_header(): void {
		$_POST['reportId'] = 'rpt-abc-123';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_get'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => '%PDF-1.4 content',
			);
		};

		$this->call_handler( 'handle_download_report' );

		$this->assertArrayHasKey( 'Authorization', $captured_args['headers'] );
		$this->assertStringStartsWith( 'Bearer ', $captured_args['headers']['Authorization'] );
	}

	// ─── Sanitization — generate_report ──────────────────────────────────────────

	public function test_generate_report_sanitizes_response_fields(): void {
		$_POST['title'] = 'Test Report';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array(
				'success' => true,
				'data'    => array(
					'id'         => '<script>alert(1)</script>rpt-evil',
					'title'      => '<b>Bold Title</b>',
					'status'     => '<img onerror=alert(1)>done',
					'chartCount' => 2,
					'createdAt'  => '<em>2026-02-12</em>',
				),
			)
		);

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertTrue( $e->success );
		$this->assertStringNotContainsString( '<script>', $e->data['id'] );
		$this->assertStringNotContainsString( '<b>', $e->data['title'] );
		$this->assertStringNotContainsString( '<img', $e->data['status'] );
		$this->assertStringNotContainsString( '<em>', $e->data['createdAt'] );
	}

	public function test_generate_report_chart_count_is_integer(): void {
		$_POST['title'] = 'Test Report';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array(
				'success' => true,
				'data'    => $this->sample_report( array( 'chartCount' => '7' ) ),
			)
		);

		$e = $this->call_handler( 'handle_generate_report' );

		$this->assertTrue( $e->success );
		$this->assertIsInt( $e->data['chartCount'] );
		$this->assertSame( 7, $e->data['chartCount'] );
	}

	// ─── Edge Cases ──────────────────────────────────────────────────────────────

	public function test_generate_report_sanitizes_html_in_title_input(): void {
		$_POST['title'] = '<script>alert("xss")</script>Revenue Report';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array(
				'success' => true,
				'data'    => $this->sample_report( array( 'title' => 'alert("xss")Revenue Report' ) ),
			)
		);

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 201, 'message' => 'Created' ),
				'body'     => json_encode( array(
					'success' => true,
					'data'    => $this->sample_report(),
				) ),
			);
		};

		$this->call_handler( 'handle_generate_report' );

		$body = json_decode( $captured_args['body'], true );
		// sanitize_text_field strips HTML tags.
		$this->assertStringNotContainsString( '<script>', $body['title'] );
	}

	public function test_download_report_url_encodes_report_id(): void {
		$_POST['reportId'] = 'rpt with spaces';

		$captured_url = null;
		WP_Stubs::$overrides['wp_remote_get'] = function ( $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => '%PDF-1.4 content',
			);
		};

		$this->call_handler( 'handle_download_report' );

		// rawurlencode converts spaces to %20.
		$this->assertStringContainsString( 'rpt%20with%20spaces', $captured_url );
	}
}
