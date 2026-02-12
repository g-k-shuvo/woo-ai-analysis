<?php
/**
 * Unit tests for dashboard grid layout AJAX handler.
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
 * Tests for Ajax_Handler grid layout endpoint (waa_update_grid_layout).
 */
final class DashboardLayoutAjaxTest extends TestCase {

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

	public function test_registers_update_grid_layout_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_update_grid_layout'
		);

		$this->assertNotEmpty( $hooks, 'waa_update_grid_layout action should be registered' );
	}

	// ─── Nonce & Permission ──────────────────────────────────────────────────────

	public function test_update_grid_layout_checks_nonce(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'updated' => true ) )
		);

		$this->call_handler( 'handle_update_grid_layout' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_update_grid_layout_rejects_no_permission(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	// ─── Input Validation ────────────────────────────────────────────────────────

	public function test_update_grid_layout_rejects_missing_items(): void {
		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Layout items are required.', $e->data['message'] );
	}

	public function test_update_grid_layout_rejects_empty_items(): void {
		$_POST['items'] = '';

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Layout items are required.', $e->data['message'] );
	}

	public function test_update_grid_layout_rejects_invalid_json(): void {
		$_POST['items'] = 'not-json';

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Invalid layout data.', $e->data['message'] );
	}

	public function test_update_grid_layout_rejects_non_array_json(): void {
		$_POST['items'] = '"just a string"';

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Invalid layout data.', $e->data['message'] );
	}

	public function test_update_grid_layout_rejects_empty_array(): void {
		$_POST['items'] = '[]';

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Invalid layout data.', $e->data['message'] );
	}

	public function test_update_grid_layout_rejects_item_without_id(): void {
		$_POST['items'] = json_encode( array(
			array( 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Each item must have a valid id.', $e->data['message'] );
	}

	public function test_update_grid_layout_rejects_item_with_empty_id(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => '', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Each item must have a valid id.', $e->data['message'] );
	}

	// ─── Store Not Connected ─────────────────────────────────────────────────────

	public function test_update_grid_layout_fails_when_not_connected(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	// ─── Successful Update ──────────────────────────────────────────────────────

	public function test_update_grid_layout_returns_success(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
			array( 'id' => 'chart-2', 'gridX' => 6, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'updated' => true ) )
		);

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertTrue( $e->success );
		$this->assertTrue( $e->data['updated'] );
	}

	public function test_update_grid_layout_sends_put_method(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => json_encode( array( 'success' => true, 'data' => array( 'updated' => true ) ) ),
			);
		};

		$this->call_handler( 'handle_update_grid_layout' );

		$this->assertSame( 'PUT', $captured_args['method'] );
	}

	public function test_update_grid_layout_sends_correct_url(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		$captured_url = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => json_encode( array( 'success' => true, 'data' => array( 'updated' => true ) ) ),
			);
		};

		$this->call_handler( 'handle_update_grid_layout' );

		$this->assertStringContainsString( 'api/dashboards/grid-layout', $captured_url );
	}

	public function test_update_grid_layout_sends_correct_payload(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1', 'gridX' => 3, 'gridY' => 2, 'gridW' => 9, 'gridH' => 6 ),
		) );

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => json_encode( array( 'success' => true, 'data' => array( 'updated' => true ) ) ),
			);
		};

		$this->call_handler( 'handle_update_grid_layout' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertCount( 1, $body['items'] );
		$this->assertSame( 'chart-1', $body['items'][0]['id'] );
		$this->assertSame( 3, $body['items'][0]['gridX'] );
		$this->assertSame( 2, $body['items'][0]['gridY'] );
		$this->assertSame( 9, $body['items'][0]['gridW'] );
		$this->assertSame( 6, $body['items'][0]['gridH'] );
	}

	public function test_update_grid_layout_sanitizes_item_ids(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => '<script>alert(1)</script>chart-1', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => json_encode( array( 'success' => true, 'data' => array( 'updated' => true ) ) ),
			);
		};

		$this->call_handler( 'handle_update_grid_layout' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertStringNotContainsString( '<script>', $body['items'][0]['id'] );
	}

	// ─── Backend Errors ──────────────────────────────────────────────────────────

	public function test_update_grid_layout_handles_wp_error(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		WP_Stubs::$overrides['wp_remote_request'] = fn() => new WP_Error( 'timeout', 'Connection timed out' );

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_update_grid_layout_handles_backend_error(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_response(
			400,
			array( 'success' => false, 'error' => array( 'message' => 'gridW must be between 3 and 12' ) )
		);

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'gridW must be between 3 and 12', $e->data['message'] );
	}

	public function test_update_grid_layout_handles_404_error(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'nonexistent', 'gridX' => 0, 'gridY' => 0, 'gridW' => 6, 'gridH' => 4 ),
		) );

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_response(
			404,
			array( 'success' => false, 'error' => array( 'message' => 'Chart not found' ) )
		);

		$e = $this->call_handler( 'handle_update_grid_layout' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Chart not found', $e->data['message'] );
	}

	// ─── Grid fields in list_charts response ─────────────────────────────────────

	public function test_list_charts_includes_grid_fields(): void {
		$chart_data = array(
			'id'            => 'chart-1',
			'title'         => 'Revenue',
			'queryText'     => 'Show revenue',
			'chartConfig'   => array( 'type' => 'bar' ),
			'positionIndex' => 0,
			'gridX'         => 3,
			'gridY'         => 2,
			'gridW'         => 9,
			'gridH'         => 6,
			'createdAt'     => '2026-02-12T00:00:00Z',
			'updatedAt'     => '2026-02-12T00:00:00Z',
		);

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'charts' => array( $chart_data ) ) )
		);

		$e = $this->call_handler( 'handle_list_charts' );

		$this->assertTrue( $e->success );
		$this->assertSame( 3, $e->data['charts'][0]['gridX'] );
		$this->assertSame( 2, $e->data['charts'][0]['gridY'] );
		$this->assertSame( 9, $e->data['charts'][0]['gridW'] );
		$this->assertSame( 6, $e->data['charts'][0]['gridH'] );
	}

	public function test_list_charts_defaults_grid_fields_when_missing(): void {
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
		$this->assertSame( 0, $e->data['charts'][0]['gridX'] );
		$this->assertSame( 0, $e->data['charts'][0]['gridY'] );
		$this->assertSame( 6, $e->data['charts'][0]['gridW'] );
		$this->assertSame( 4, $e->data['charts'][0]['gridH'] );
	}

	// ─── Save chart response includes grid fields ────────────────────────────────

	public function test_save_chart_response_includes_grid_fields(): void {
		$_POST['title']       = 'Revenue Chart';
		$_POST['chartConfig'] = json_encode( array( 'type' => 'bar' ) );

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array(
				'success' => true,
				'data'    => array(
					'id'            => 'chart-1',
					'title'         => 'Revenue Chart',
					'queryText'     => '',
					'chartConfig'   => array( 'type' => 'bar' ),
					'positionIndex' => 0,
					'gridX'         => 0,
					'gridY'         => 0,
					'gridW'         => 6,
					'gridH'         => 4,
					'createdAt'     => '2026-02-12T00:00:00Z',
					'updatedAt'     => '2026-02-12T00:00:00Z',
				),
			)
		);

		$e = $this->call_handler( 'handle_save_chart' );

		$this->assertTrue( $e->success );
		$this->assertSame( 0, $e->data['gridX'] );
		$this->assertSame( 0, $e->data['gridY'] );
		$this->assertSame( 6, $e->data['gridW'] );
		$this->assertSame( 4, $e->data['gridH'] );
	}

	// ─── Default grid values for items without explicit grid fields ───────────────

	public function test_update_grid_layout_defaults_missing_grid_values(): void {
		$_POST['items'] = json_encode( array(
			array( 'id' => 'chart-1' ),
		) );

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return array(
				'response' => array( 'code' => 200, 'message' => 'OK' ),
				'body'     => json_encode( array( 'success' => true, 'data' => array( 'updated' => true ) ) ),
			);
		};

		$this->call_handler( 'handle_update_grid_layout' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertSame( 0, $body['items'][0]['gridX'] );
		$this->assertSame( 0, $body['items'][0]['gridY'] );
		$this->assertSame( 6, $body['items'][0]['gridW'] );
		$this->assertSame( 4, $body['items'][0]['gridH'] );
	}
}
