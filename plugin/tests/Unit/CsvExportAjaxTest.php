<?php
/**
 * Unit tests for CSV export AJAX handler in Ajax_Handler.
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
 * Tests for Ajax_Handler CSV export endpoint.
 */
final class CsvExportAjaxTest extends TestCase {

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

	private function make_csv_response( int $code, string $csv_body ): array {
		return array(
			'response' => array( 'code' => $code, 'message' => 'OK' ),
			'body'     => $csv_body,
			'headers'  => new \WP_Http_Headers_Stub( array(
				'content-type'        => 'text/csv; charset=utf-8',
				'content-disposition' => 'attachment; filename="dashboard-export-2026-02-12.csv"',
			) ),
		);
	}

	private function make_json_response( int $code, array $body ): array {
		return array(
			'response' => array( 'code' => $code, 'message' => 'OK' ),
			'body'     => (string) json_encode( $body ),
			'headers'  => new \WP_Http_Headers_Stub( array(
				'content-type' => 'application/json',
			) ),
		);
	}

	// ─── Action Registration ─────────────────────────────────────────────────────

	public function test_registers_export_csv_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_export_csv'
		);

		$this->assertNotEmpty( $hooks, 'waa_export_csv action should be registered' );
	}

	// ─── Nonce & Permission ──────────────────────────────────────────────────────

	public function test_export_csv_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_csv_response(
			200,
			"Label,Value\r\nA,1"
		);

		$this->call_handler( 'handle_export_csv' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_export_csv_rejects_no_permission(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	// ─── Store Not Connected ─────────────────────────────────────────────────────

	public function test_export_csv_fails_when_no_api_url(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	public function test_export_csv_fails_when_no_auth_token(): void {
		unset( WP_Stubs::$options['waa_store_api_key'] );

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	// ─── Backend Errors ──────────────────────────────────────────────────────────

	public function test_export_csv_handles_wp_error(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => new WP_Error( 'timeout', 'Connection timed out' );

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_export_csv_handles_non_200_status(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			400,
			array(
				'success' => false,
				'error'   => array( 'message' => 'No saved charts to export.' ),
			)
		);

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'No saved charts to export.', $e->data['message'] );
	}

	public function test_export_csv_uses_default_error_when_no_error_message(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			500,
			array( 'success' => false )
		);

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Failed to export CSV.', $e->data['message'] );
	}

	public function test_export_csv_handles_non_csv_content_type(): void {
		$response = array(
			'response' => array( 'code' => 200, 'message' => 'OK' ),
			'body'     => 'Not CSV content',
			'headers'  => new \WP_Http_Headers_Stub( array(
				'content-type' => 'text/html',
			) ),
		);

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $response;

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Failed to export CSV.', $e->data['message'] );
	}

	// ─── Successful Export ───────────────────────────────────────────────────────

	public function test_export_csv_returns_base64_csv_data(): void {
		$csv_content = "\xEF\xBB\xBFLabel,Revenue\r\nJan,1000\r\nFeb,2000";

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_csv_response(
			200,
			$csv_content
		);

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertTrue( $e->success );
		$this->assertSame( base64_encode( $csv_content ), $e->data['csvData'] );
	}

	public function test_export_csv_returns_filename(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_csv_response(
			200,
			"Label,Value\r\nA,1"
		);

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertTrue( $e->success );
		$this->assertSame( 'dashboard-export-2026-02-12.csv', $e->data['filename'] );
	}

	public function test_export_csv_uses_default_filename_when_no_disposition(): void {
		$response = array(
			'response' => array( 'code' => 200, 'message' => 'OK' ),
			'body'     => "Label,Value\r\nA,1",
			'headers'  => new \WP_Http_Headers_Stub( array(
				'content-type' => 'text/csv; charset=utf-8',
			) ),
		);

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $response;

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertTrue( $e->success );
		$this->assertSame( 'dashboard-export.csv', $e->data['filename'] );
	}

	public function test_export_csv_sends_correct_request_url(): void {
		$captured_url = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => "Label,Value\r\nA,1",
				'headers'  => new \WP_Http_Headers_Stub( array(
					'content-type'        => 'text/csv; charset=utf-8',
					'content-disposition' => 'attachment; filename="dashboard-export-2026-02-12.csv"',
				) ),
			);
		};

		$this->call_handler( 'handle_export_csv' );

		$this->assertSame( 'https://api.example.com/api/exports/csv', $captured_url );
	}

	public function test_export_csv_sends_authorization_header(): void {
		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => "Label,Value\r\nA,1",
				'headers'  => new \WP_Http_Headers_Stub( array(
					'content-type'        => 'text/csv; charset=utf-8',
					'content-disposition' => 'attachment; filename="test.csv"',
				) ),
			);
		};

		$this->call_handler( 'handle_export_csv' );

		$this->assertArrayHasKey( 'Authorization', $captured_args['headers'] );
		$this->assertStringStartsWith( 'Bearer ', $captured_args['headers']['Authorization'] );
	}

	public function test_export_csv_sends_chart_id_when_provided(): void {
		$_POST['chartId'] = 'chart-abc-123';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => "Label,Value\r\nA,1",
				'headers'  => new \WP_Http_Headers_Stub( array(
					'content-type'        => 'text/csv; charset=utf-8',
					'content-disposition' => 'attachment; filename="chart-export-2026-02-12.csv"',
				) ),
			);
		};

		$this->call_handler( 'handle_export_csv' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertSame( 'chart-abc-123', $body['chartId'] );
	}

	public function test_export_csv_sends_empty_body_when_no_chart_id(): void {
		// No $_POST['chartId']

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => "Label,Value\r\nA,1",
				'headers'  => new \WP_Http_Headers_Stub( array(
					'content-type'        => 'text/csv; charset=utf-8',
					'content-disposition' => 'attachment; filename="test.csv"',
				) ),
			);
		};

		$this->call_handler( 'handle_export_csv' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertArrayNotHasKey( 'chartId', $body );
	}

	public function test_export_csv_sanitizes_chart_id_input(): void {
		$_POST['chartId'] = '<script>alert("xss")</script>chart-id';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => "Label,Value\r\nA,1",
				'headers'  => new \WP_Http_Headers_Stub( array(
					'content-type'        => 'text/csv; charset=utf-8',
					'content-disposition' => 'attachment; filename="test.csv"',
				) ),
			);
		};

		$this->call_handler( 'handle_export_csv' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertStringNotContainsString( '<script>', $body['chartId'] );
	}

	public function test_export_csv_sanitizes_filename_from_disposition(): void {
		$response = array(
			'response' => array( 'code' => 200, 'message' => 'OK' ),
			'body'     => "Label,Value\r\nA,1",
			'headers'  => new \WP_Http_Headers_Stub( array(
				'content-type'        => 'text/csv; charset=utf-8',
				'content-disposition' => 'attachment; filename="<script>evil.csv"',
			) ),
		);

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $response;

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertTrue( $e->success );
		// sanitize_file_name should strip < and >
		$this->assertStringNotContainsString( '<', $e->data['filename'] );
		$this->assertStringNotContainsString( '>', $e->data['filename'] );
	}

	public function test_export_csv_handles_timeout(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => new WP_Error(
			'http_request_failed',
			'cURL error 28: Connection timed out'
		);

		$e = $this->call_handler( 'handle_export_csv' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_export_csv_sends_content_type_json_header(): void {
		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => "Label,Value\r\nA,1",
				'headers'  => new \WP_Http_Headers_Stub( array(
					'content-type'        => 'text/csv; charset=utf-8',
					'content-disposition' => 'attachment; filename="test.csv"',
				) ),
			);
		};

		$this->call_handler( 'handle_export_csv' );

		$this->assertSame( 'application/json', $captured_args['headers']['Content-Type'] );
	}

	public function test_export_csv_sets_30_second_timeout(): void {
		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => "Label,Value\r\nA,1",
				'headers'  => new \WP_Http_Headers_Stub( array(
					'content-type'        => 'text/csv; charset=utf-8',
					'content-disposition' => 'attachment; filename="test.csv"',
				) ),
			);
		};

		$this->call_handler( 'handle_export_csv' );

		$this->assertSame( 30, $captured_args['timeout'] );
	}
}
