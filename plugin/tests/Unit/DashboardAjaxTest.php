<?php
/**
 * Unit tests for dashboard AJAX handlers in Ajax_Handler.
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
 * Tests for Ajax_Handler dashboard endpoints (save/list/delete charts).
 */
final class DashboardAjaxTest extends TestCase {

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

	// ─── Action Registration ─────────────────────────────────────────────────────

	public function test_registers_save_chart_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_save_chart'
		);

		$this->assertNotEmpty( $hooks, 'waa_save_chart action should be registered' );
	}

	public function test_registers_list_charts_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_list_charts'
		);

		$this->assertNotEmpty( $hooks, 'waa_list_charts action should be registered' );
	}

	public function test_registers_delete_chart_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_delete_chart'
		);

		$this->assertNotEmpty( $hooks, 'waa_delete_chart action should be registered' );
	}

	// ─── handle_save_chart — Nonce & Permission ──────────────────────────────────

	public function test_save_chart_checks_nonce(): void {
		$_POST['title']       = 'Test Chart';
		$_POST['chartConfig'] = '{"type":"bar"}';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array(
				'success' => true,
				'data'    => array(
					'id'            => 'chart-1',
					'title'         => 'Test Chart',
					'queryText'     => '',
					'chartConfig'   => array( 'type' => 'bar' ),
					'positionIndex' => 0,
					'createdAt'     => '2026-02-12T00:00:00Z',
					'updatedAt'     => '2026-02-12T00:00:00Z',
				),
			)
		);

		$this->call_handler( 'handle_save_chart' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_save_chart_rejects_no_permission(): void {
		$_POST['title']       = 'Test Chart';
		$_POST['chartConfig'] = '{"type":"bar"}';

		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	// ─── handle_save_chart — Input Validation ────────────────────────────────────

	public function test_save_chart_rejects_empty_title(): void {
		$_POST['title']       = '';
		$_POST['chartConfig'] = '{"type":"bar"}';

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Title is required.', $e->data['message'] );
	}

	public function test_save_chart_rejects_missing_chart_config(): void {
		$_POST['title'] = 'Test Chart';

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Chart configuration is required.', $e->data['message'] );
	}

	public function test_save_chart_rejects_invalid_json_chart_config(): void {
		$_POST['title']       = 'Test Chart';
		$_POST['chartConfig'] = 'not-json';

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Invalid chart configuration.', $e->data['message'] );
	}

	public function test_save_chart_rejects_non_object_chart_config(): void {
		$_POST['title']       = 'Test Chart';
		$_POST['chartConfig'] = '"just a string"';

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Invalid chart configuration.', $e->data['message'] );
	}

	// ─── handle_save_chart — Store Not Connected ─────────────────────────────────

	public function test_save_chart_fails_when_not_connected(): void {
		$_POST['title']       = 'Test Chart';
		$_POST['chartConfig'] = '{"type":"bar"}';

		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	// ─── handle_save_chart — Successful Save ─────────────────────────────────────

	public function test_save_chart_returns_success_on_201(): void {
		$_POST['title']       = 'Revenue by Product';
		$_POST['queryText']   = 'Show revenue by product';
		$_POST['chartConfig'] = json_encode( array( 'type' => 'bar', 'data' => array() ) );

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array(
				'success' => true,
				'data'    => array(
					'id'            => 'chart-123',
					'title'         => 'Revenue by Product',
					'queryText'     => 'Show revenue by product',
					'chartConfig'   => array( 'type' => 'bar', 'data' => array() ),
					'positionIndex' => 0,
					'createdAt'     => '2026-02-12T00:00:00Z',
					'updatedAt'     => '2026-02-12T00:00:00Z',
				),
			)
		);

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertTrue( $e->success );
		$this->assertSame( 'chart-123', $e->data['id'] );
		$this->assertSame( 'Revenue by Product', $e->data['title'] );
	}

	public function test_save_chart_sends_correct_payload(): void {
		$_POST['title']       = 'My Chart';
		$_POST['queryText']   = 'test query';
		$_POST['chartConfig'] = '{"type":"line"}';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 201, 'message' => 'Created' ),
				'body'     => json_encode( array(
					'success' => true,
					'data'    => array(
						'id' => 'chart-1', 'title' => 'My Chart',
						'queryText' => 'test query',
						'chartConfig' => array( 'type' => 'line' ),
						'positionIndex' => 0,
						'createdAt' => '2026-02-12T00:00:00Z',
						'updatedAt' => '2026-02-12T00:00:00Z',
					),
				) ),
			);
		};

		$this->call_handler( 'handle_save_chart' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertSame( 'My Chart', $body['title'] );
		$this->assertSame( 'test query', $body['queryText'] );
		$this->assertSame( array( 'type' => 'line' ), $body['chartConfig'] );
	}

	// ─── handle_save_chart — Backend Errors ──────────────────────────────────────

	public function test_save_chart_handles_backend_error(): void {
		$_POST['title']       = 'Test';
		$_POST['chartConfig'] = '{"type":"bar"}';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			400,
			array(
				'success' => false,
				'error'   => array( 'message' => 'Maximum charts reached' ),
			)
		);

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Maximum charts reached', $e->data['message'] );
	}

	public function test_save_chart_handles_wp_error(): void {
		$_POST['title']       = 'Test';
		$_POST['chartConfig'] = '{"type":"bar"}';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => new WP_Error( 'timeout', 'Connection timed out' );

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	// ─── handle_list_charts ──────────────────────────────────────────────────────

	public function test_list_charts_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'charts' => array() ) )
		);

		$this->call_handler( 'handle_list_charts' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_list_charts_rejects_no_permission(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_list_charts' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	public function test_list_charts_fails_when_not_connected(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_list_charts' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	public function test_list_charts_returns_charts_array(): void {
		$chart_data = array(
			'id'            => 'chart-1',
			'title'         => 'Revenue',
			'queryText'     => 'Show revenue',
			'chartConfig'   => array( 'type' => 'bar' ),
			'positionIndex' => 0,
			'createdAt'     => '2026-02-12T00:00:00Z',
			'updatedAt'     => '2026-02-12T00:00:00Z',
		);

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'charts' => array( $chart_data ) ) )
		);

		$e = $this->call_handler( 'handle_list_charts' );

		$this->assertTrue( $e->success );
		$this->assertCount( 1, $e->data['charts'] );
		$this->assertSame( 'chart-1', $e->data['charts'][0]['id'] );
		$this->assertSame( 'Revenue', $e->data['charts'][0]['title'] );
	}

	public function test_list_charts_returns_empty_array_when_no_charts(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'charts' => array() ) )
		);

		$e = $this->call_handler( 'handle_list_charts' );

		$this->assertTrue( $e->success );
		$this->assertSame( array(), $e->data['charts'] );
	}

	public function test_list_charts_handles_wp_error(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'timeout', 'Connection timed out' );

		$e = $this->call_handler( 'handle_list_charts' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_list_charts_handles_backend_error(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			500,
			array( 'success' => false, 'error' => array( 'message' => 'Internal error' ) )
		);

		$e = $this->call_handler( 'handle_list_charts' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Internal error', $e->data['message'] );
	}

	// ─── handle_delete_chart ─────────────────────────────────────────────────────

	public function test_delete_chart_checks_nonce(): void {
		$_POST['chartId'] = 'chart-1';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'deleted' => true ) )
		);

		$this->call_handler( 'handle_delete_chart' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_delete_chart_rejects_no_permission(): void {
		$_POST['chartId'] = 'chart-1';

		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_delete_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	public function test_delete_chart_rejects_empty_chart_id(): void {
		$_POST['chartId'] = '';

		$e = $this->call_handler( 'handle_delete_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Chart ID is required.', $e->data['message'] );
	}

	public function test_delete_chart_rejects_missing_chart_id(): void {
		$e = $this->call_handler( 'handle_delete_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Chart ID is required.', $e->data['message'] );
	}

	public function test_delete_chart_fails_when_not_connected(): void {
		$_POST['chartId'] = 'chart-1';

		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_delete_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	public function test_delete_chart_returns_success(): void {
		$_POST['chartId'] = 'chart-1';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'deleted' => true ) )
		);

		$e = $this->call_handler( 'handle_delete_chart' );

		$this->assertTrue( $e->success );
		$this->assertTrue( $e->data['deleted'] );
	}

	public function test_delete_chart_sends_delete_method(): void {
		$_POST['chartId'] = 'chart-123';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => json_encode( array( 'success' => true, 'data' => array( 'deleted' => true ) ) ),
			);
		};

		$this->call_handler( 'handle_delete_chart' );

		$this->assertSame( 'DELETE', $captured_args['method'] );
	}

	public function test_delete_chart_uses_chart_id_in_url(): void {
		$_POST['chartId'] = 'chart-456';

		$captured_url = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => json_encode( array( 'success' => true, 'data' => array( 'deleted' => true ) ) ),
			);
		};

		$this->call_handler( 'handle_delete_chart' );

		$this->assertStringContainsString( 'api/dashboards/charts/chart-456', $captured_url );
	}

	public function test_delete_chart_handles_wp_error(): void {
		$_POST['chartId'] = 'chart-1';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => new WP_Error( 'timeout', 'Connection timed out' );

		$e = $this->call_handler( 'handle_delete_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_delete_chart_handles_backend_error(): void {
		$_POST['chartId'] = 'chart-1';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_response(
			404,
			array( 'success' => false, 'error' => array( 'message' => 'Chart not found' ) )
		);

		$e = $this->call_handler( 'handle_delete_chart' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Chart not found', $e->data['message'] );
	}

	// ─── Sanitization ────────────────────────────────────────────────────────────

	public function test_save_chart_sanitizes_response(): void {
		$_POST['title']       = 'Test';
		$_POST['chartConfig'] = '{"type":"bar"}';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array(
				'success' => true,
				'data'    => array(
					'id'            => '<script>alert(1)</script>chart-1',
					'title'         => '<b>Bold Title</b>',
					'queryText'     => '<em>query</em>',
					'chartConfig'   => array( 'type' => 'bar' ),
					'positionIndex' => 0,
					'createdAt'     => '2026-02-12T00:00:00Z',
					'updatedAt'     => '2026-02-12T00:00:00Z',
				),
			)
		);

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertTrue( $e->success );
		$this->assertStringNotContainsString( '<script>', $e->data['id'] );
		$this->assertStringNotContainsString( '<b>', $e->data['title'] );
		$this->assertStringNotContainsString( '<em>', $e->data['queryText'] );
	}

	public function test_list_charts_sanitizes_chart_data(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array(
				'success' => true,
				'data'    => array(
					'charts' => array(
						array(
							'id'            => 'chart-1',
							'title'         => '<script>XSS</script>Revenue',
							'queryText'     => 'test',
							'chartConfig'   => array( 'type' => 'bar' ),
							'positionIndex' => 0,
							'createdAt'     => '2026-02-12T00:00:00Z',
							'updatedAt'     => '2026-02-12T00:00:00Z',
						),
					),
				),
			)
		);

		$e = $this->call_handler( 'handle_list_charts' );

		$this->assertTrue( $e->success );
		$this->assertStringNotContainsString( '<script>', $e->data['charts'][0]['title'] );
	}
}
