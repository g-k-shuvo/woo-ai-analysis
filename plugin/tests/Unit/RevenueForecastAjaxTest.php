<?php
/**
 * Unit tests for Revenue Forecast AJAX handlers in Ajax_Handler.
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
 * Tests for Ajax_Handler revenue forecast endpoints.
 */
final class RevenueForecastAjaxTest extends TestCase {

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

	private function make_json_response( int $code, array $body ): array {
		return array(
			'response' => array( 'code' => $code, 'message' => 'OK' ),
			'body'     => (string) json_encode( $body ),
			'headers'  => new \WP_Http_Headers_Stub( array(
				'content-type' => 'application/json',
			) ),
		);
	}

	private function make_forecast_data( array $overrides = array() ): array {
		return array_merge(
			array(
				'id'             => 'aabb0000-1111-2222-3333-444455556666',
				'daysAhead'      => 30,
				'historicalDays' => 90,
				'dataPoints'     => array(
					array( 'date' => '2026-02-13', 'predicted' => 1250.50, 'type' => 'forecast' ),
					array( 'date' => '2026-02-14', 'predicted' => 1275.00, 'type' => 'forecast' ),
				),
				'summary'        => array(
					'avgDailyRevenue' => 1200.00,
					'projectedTotal'  => 37500.00,
					'trend'           => 'up',
				),
				'createdAt'      => '2026-02-12T10:00:00.000Z',
			),
			$overrides
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Action Registration
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_registers_generate_forecast_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_generate_forecast'
		);
		$this->assertNotEmpty( $hooks );
	}

	public function test_registers_list_forecasts_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_list_forecasts'
		);
		$this->assertNotEmpty( $hooks );
	}

	public function test_registers_get_forecast_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_get_forecast'
		);
		$this->assertNotEmpty( $hooks );
	}

	public function test_registers_delete_forecast_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_delete_forecast'
		);
		$this->assertNotEmpty( $hooks );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// GENERATE (handle_generate_forecast)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_generate_checks_nonce(): void {
		$_POST['daysAhead'] = '30';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_forecast_data() )
		);

		$this->call_handler( 'handle_generate_forecast' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_generate_checks_permissions(): void {
		$_POST['daysAhead'] = '30';
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	public function test_generate_rejects_invalid_days_ahead(): void {
		$_POST['daysAhead'] = '15';

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Days ahead must be 7, 14, or 30', $result->data['message'] );
	}

	public function test_generate_rejects_zero_days_ahead(): void {
		$_POST['daysAhead'] = '0';

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Days ahead must be 7, 14, or 30', $result->data['message'] );
	}

	public function test_generate_accepts_7_days(): void {
		$_POST['daysAhead'] = '7';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_forecast_data( array( 'daysAhead' => 7 ) ) )
		);

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertTrue( $result->success );
		$this->assertSame( 7, $result->data['daysAhead'] );
	}

	public function test_generate_accepts_14_days(): void {
		$_POST['daysAhead'] = '14';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_forecast_data( array( 'daysAhead' => 14 ) ) )
		);

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertTrue( $result->success );
		$this->assertSame( 14, $result->data['daysAhead'] );
	}

	public function test_generate_accepts_30_days(): void {
		$_POST['daysAhead'] = '30';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_forecast_data() )
		);

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertTrue( $result->success );
		$this->assertSame( 30, $result->data['daysAhead'] );
	}

	public function test_generate_fails_when_not_connected(): void {
		$_POST['daysAhead'] = '30';
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not connected', $result->data['message'] );
	}

	public function test_generate_handles_api_error(): void {
		$_POST['daysAhead'] = '30';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => new WP_Error( 'http_request_failed', 'Connection timed out' );

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Unable to connect', $result->data['message'] );
	}

	public function test_generate_handles_backend_error_response(): void {
		$_POST['daysAhead'] = '30';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			400,
			array( 'success' => false, 'error' => array( 'message' => 'At least 7 days of order history required' ) )
		);

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( '7 days', $result->data['message'] );
	}

	public function test_generate_sanitizes_response(): void {
		$_POST['daysAhead'] = '30';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_forecast_data() )
		);

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'aabb0000-1111-2222-3333-444455556666', $result->data['id'] );
		$this->assertSame( 30, $result->data['daysAhead'] );
		$this->assertSame( 90, $result->data['historicalDays'] );
		$this->assertIsArray( $result->data['dataPoints'] );
		$this->assertCount( 2, $result->data['dataPoints'] );
		$this->assertSame( '2026-02-13', $result->data['dataPoints'][0]['date'] );
		$this->assertEqualsWithDelta( 1250.50, $result->data['dataPoints'][0]['predicted'], 0.01 );
		$this->assertSame( 'forecast', $result->data['dataPoints'][0]['type'] );
		$this->assertIsArray( $result->data['summary'] );
		$this->assertEqualsWithDelta( 1200.00, $result->data['summary']['avgDailyRevenue'], 0.01 );
		$this->assertEqualsWithDelta( 37500.00, $result->data['summary']['projectedTotal'], 0.01 );
		$this->assertSame( 'up', $result->data['summary']['trend'] );
	}

	public function test_generate_sends_correct_payload(): void {
		$_POST['daysAhead'] = '14';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				201,
				array( 'success' => true, 'data' => $this->make_forecast_data( array( 'daysAhead' => 14 ) ) )
			);
		};

		$this->call_handler( 'handle_generate_forecast' );

		$this->assertNotNull( $captured_args );
		$body = json_decode( $captured_args['body'], true );
		$this->assertSame( 14, $body['daysAhead'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// LIST (handle_list_forecasts)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_list_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'forecasts' => array() ) )
		);

		$this->call_handler( 'handle_list_forecasts' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_list_checks_permissions(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_list_forecasts' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	public function test_list_fails_when_not_connected(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_list_forecasts' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not connected', $result->data['message'] );
	}

	public function test_list_returns_forecasts(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array(
				'success' => true,
				'data'    => array(
					'forecasts' => array(
						$this->make_forecast_data(),
						$this->make_forecast_data( array( 'id' => 'ccdd0000-1111-2222-3333-444455557777', 'daysAhead' => 7 ) ),
					),
				),
			)
		);

		$result = $this->call_handler( 'handle_list_forecasts' );

		$this->assertTrue( $result->success );
		$this->assertCount( 2, $result->data['forecasts'] );
		$this->assertSame( 'aabb0000-1111-2222-3333-444455556666', $result->data['forecasts'][0]['id'] );
		$this->assertSame( 'ccdd0000-1111-2222-3333-444455557777', $result->data['forecasts'][1]['id'] );
	}

	public function test_list_returns_empty_array(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'forecasts' => array() ) )
		);

		$result = $this->call_handler( 'handle_list_forecasts' );

		$this->assertTrue( $result->success );
		$this->assertEmpty( $result->data['forecasts'] );
	}

	public function test_list_handles_api_error(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'http_request_failed', 'Timeout' );

		$result = $this->call_handler( 'handle_list_forecasts' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Unable to connect', $result->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// GET (handle_get_forecast)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_get_checks_nonce(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => $this->make_forecast_data() )
		);

		$this->call_handler( 'handle_get_forecast' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_get_checks_permissions(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_get_forecast' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	public function test_get_requires_forecast_id(): void {
		$result = $this->call_handler( 'handle_get_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Forecast ID is required', $result->data['message'] );
	}

	public function test_get_rejects_invalid_forecast_id_format(): void {
		$_POST['forecastId'] = 'invalid<script>format';

		$result = $this->call_handler( 'handle_get_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Invalid forecast ID format', $result->data['message'] );
	}

	public function test_get_fails_when_not_connected(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_get_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not connected', $result->data['message'] );
	}

	public function test_get_returns_forecast(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => $this->make_forecast_data() )
		);

		$result = $this->call_handler( 'handle_get_forecast' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'aabb0000-1111-2222-3333-444455556666', $result->data['id'] );
		$this->assertSame( 30, $result->data['daysAhead'] );
	}

	public function test_get_handles_api_error(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'http_request_failed', 'Timeout' );

		$result = $this->call_handler( 'handle_get_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Unable to connect', $result->data['message'] );
	}

	public function test_get_handles_404_response(): void {
		$_POST['forecastId'] = '00000000-0000-0000-0000-000000009999';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			404,
			array( 'success' => false, 'error' => array( 'message' => 'Forecast not found' ) )
		);

		$result = $this->call_handler( 'handle_get_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not found', $result->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// DELETE (handle_delete_forecast)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_delete_checks_nonce(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'deleted' => true ) )
		);

		$this->call_handler( 'handle_delete_forecast' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_delete_checks_permissions(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_delete_forecast' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	public function test_delete_requires_forecast_id(): void {
		$result = $this->call_handler( 'handle_delete_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Forecast ID is required', $result->data['message'] );
	}

	public function test_delete_rejects_invalid_forecast_id_format(): void {
		$_POST['forecastId'] = 'invalid<script>format';

		$result = $this->call_handler( 'handle_delete_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Invalid forecast ID format', $result->data['message'] );
	}

	public function test_delete_fails_when_not_connected(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_delete_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not connected', $result->data['message'] );
	}

	public function test_delete_returns_success(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'deleted' => true ) )
		);

		$result = $this->call_handler( 'handle_delete_forecast' );

		$this->assertTrue( $result->success );
		$this->assertTrue( $result->data['deleted'] );
	}

	public function test_delete_handles_api_error(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => new WP_Error( 'http_request_failed', 'Timeout' );

		$result = $this->call_handler( 'handle_delete_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Unable to connect', $result->data['message'] );
	}

	public function test_delete_handles_404_response(): void {
		$_POST['forecastId'] = '00000000-0000-0000-0000-000000009999';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			404,
			array( 'success' => false, 'error' => array( 'message' => 'Forecast not found' ) )
		);

		$result = $this->call_handler( 'handle_delete_forecast' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not found', $result->data['message'] );
	}

	public function test_delete_uses_correct_http_method(): void {
		$_POST['forecastId'] = 'aabb0000-1111-2222-3333-444455556666';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				200,
				array( 'success' => true, 'data' => array( 'deleted' => true ) )
			);
		};

		$this->call_handler( 'handle_delete_forecast' );

		$this->assertNotNull( $captured_args );
		$this->assertSame( 'DELETE', $captured_args['method'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Sanitization
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_sanitize_forecast_handles_non_array_data(): void {
		$_POST['daysAhead'] = '30';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => 'not-an-array' )
		);

		$result = $this->call_handler( 'handle_generate_forecast' );

		// sanitize_forecast_response returns empty array for non-array input
		$this->assertTrue( $result->success );
		$this->assertEmpty( $result->data );
	}

	public function test_sanitize_forecast_handles_missing_fields(): void {
		$_POST['daysAhead'] = '30';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => array( 'id' => 'test-123' ) )
		);

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'test-123', $result->data['id'] );
		$this->assertSame( 0, $result->data['daysAhead'] );
		$this->assertSame( 0, $result->data['historicalDays'] );
		$this->assertEmpty( $result->data['dataPoints'] );
		$this->assertSame( 'flat', $result->data['summary']['trend'] );
	}

	public function test_sanitize_forecast_validates_trend_values(): void {
		$_POST['daysAhead'] = '30';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array(
				'success' => true,
				'data'    => $this->make_forecast_data( array(
					'summary' => array(
						'avgDailyRevenue' => 100,
						'projectedTotal'  => 700,
						'trend'           => 'invalid_trend',
					),
				) ),
			)
		);

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'flat', $result->data['summary']['trend'] );
	}

	public function test_sanitize_forecast_skips_non_array_data_points(): void {
		$_POST['daysAhead'] = '30';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array(
				'success' => true,
				'data'    => $this->make_forecast_data( array(
					'dataPoints' => array(
						array( 'date' => '2026-02-13', 'predicted' => 100, 'type' => 'forecast' ),
						'not-an-array',
						array( 'date' => '2026-02-14', 'predicted' => 110, 'type' => 'forecast' ),
					),
				) ),
			)
		);

		$result = $this->call_handler( 'handle_generate_forecast' );

		$this->assertTrue( $result->success );
		$this->assertCount( 2, $result->data['dataPoints'] );
	}
}
