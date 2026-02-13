<?php
/**
 * Unit tests for Date Range Comparison AJAX handlers in Ajax_Handler.
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
 * Tests for Ajax_Handler date range comparison endpoints.
 */
final class DateRangeComparisonAjaxTest extends TestCase {

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

	private function make_comparison_data( array $overrides = array() ): array {
		return array_merge(
			array(
				'id'            => 'cccc0000-1111-2222-3333-444455556666',
				'preset'        => 'this_month',
				'currentStart'  => '2026-02-01T00:00:00.000Z',
				'currentEnd'    => '2026-02-13T12:00:00.000Z',
				'previousStart' => '2026-01-01T00:00:00.000Z',
				'previousEnd'   => '2026-02-01T00:00:00.000Z',
				'metrics'       => array(
					'current'                 => array( 'revenue' => 12500.00, 'orderCount' => 150, 'avgOrderValue' => 83.33 ),
					'previous'                => array( 'revenue' => 10200.00, 'orderCount' => 120, 'avgOrderValue' => 85.00 ),
					'revenueChange'           => 2300.00,
					'revenueChangePercent'    => 22.55,
					'orderCountChange'        => 30,
					'orderCountChangePercent' => 25.00,
					'aovChange'               => -1.67,
					'aovChangePercent'        => -1.96,
					'trend'                   => 'up',
				),
				'breakdown'     => array(
					array( 'date' => '2026-02-01', 'currentRevenue' => 450.00, 'previousRevenue' => 380.00 ),
					array( 'date' => '2026-02-02', 'currentRevenue' => 520.00, 'previousRevenue' => 410.00 ),
				),
				'createdAt'     => '2026-02-13T10:00:00.000Z',
			),
			$overrides
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Action Registration
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_registers_generate_comparison_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_generate_comparison'
		);
		$this->assertNotEmpty( $hooks );
	}

	public function test_registers_list_comparisons_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_list_comparisons'
		);
		$this->assertNotEmpty( $hooks );
	}

	public function test_registers_get_comparison_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_get_comparison'
		);
		$this->assertNotEmpty( $hooks );
	}

	public function test_registers_delete_comparison_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_delete_comparison'
		);
		$this->assertNotEmpty( $hooks );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// GENERATE (handle_generate_comparison)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_generate_checks_nonce(): void {
		$_POST['preset'] = 'this_month';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_comparison_data() )
		);

		$this->call_handler( 'handle_generate_comparison' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_generate_checks_permissions(): void {
		$_POST['preset'] = 'this_month';
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	public function test_generate_rejects_invalid_preset(): void {
		$_POST['preset'] = 'invalid_preset';

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Invalid comparison preset', $result->data['message'] );
	}

	public function test_generate_accepts_this_month_preset(): void {
		$_POST['preset'] = 'this_month';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_comparison_data() )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'this_month', $result->data['preset'] );
	}

	public function test_generate_accepts_this_week_preset(): void {
		$_POST['preset'] = 'this_week';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_comparison_data( array( 'preset' => 'this_week' ) ) )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'this_week', $result->data['preset'] );
	}

	public function test_generate_accepts_today_preset(): void {
		$_POST['preset'] = 'today';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_comparison_data( array( 'preset' => 'today' ) ) )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
	}

	public function test_generate_accepts_custom_dates(): void {
		$_POST['currentStart']  = '2026-02-01';
		$_POST['currentEnd']    = '2026-02-28';
		$_POST['previousStart'] = '2026-01-01';
		$_POST['previousEnd']   = '2026-01-31';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_comparison_data( array( 'preset' => null ) ) )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
	}

	public function test_generate_rejects_missing_custom_dates(): void {
		$_POST['currentStart'] = '2026-02-01';
		// Missing currentEnd, previousStart, previousEnd

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'All date range fields are required', $result->data['message'] );
	}

	public function test_generate_rejects_invalid_date_format(): void {
		$_POST['currentStart']  = 'not-a-date';
		$_POST['currentEnd']    = '2026-02-28';
		$_POST['previousStart'] = '2026-01-01';
		$_POST['previousEnd']   = '2026-01-31';

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Invalid date format', $result->data['message'] );
	}

	public function test_generate_fails_when_not_connected(): void {
		$_POST['preset'] = 'this_month';
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not connected', $result->data['message'] );
	}

	public function test_generate_handles_api_error(): void {
		$_POST['preset'] = 'this_month';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => new WP_Error( 'http_request_failed', 'Connection timed out' );

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Unable to connect', $result->data['message'] );
	}

	public function test_generate_handles_backend_error_response(): void {
		$_POST['preset'] = 'this_month';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			400,
			array( 'success' => false, 'error' => array( 'message' => 'Maximum of 20 comparisons allowed per store' ) )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Maximum of 20', $result->data['message'] );
	}

	public function test_generate_sends_correct_preset_payload(): void {
		$_POST['preset'] = 'last_30_days';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				201,
				array( 'success' => true, 'data' => $this->make_comparison_data( array( 'preset' => 'last_30_days' ) ) )
			);
		};

		$this->call_handler( 'handle_generate_comparison' );

		$this->assertNotNull( $captured_args );
		$body = json_decode( $captured_args['body'], true );
		$this->assertSame( 'last_30_days', $body['preset'] );
	}

	public function test_generate_sends_correct_custom_payload(): void {
		$_POST['currentStart']  = '2026-02-01';
		$_POST['currentEnd']    = '2026-02-28';
		$_POST['previousStart'] = '2026-01-01';
		$_POST['previousEnd']   = '2026-01-31';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				201,
				array( 'success' => true, 'data' => $this->make_comparison_data( array( 'preset' => null ) ) )
			);
		};

		$this->call_handler( 'handle_generate_comparison' );

		$this->assertNotNull( $captured_args );
		$body = json_decode( $captured_args['body'], true );
		$this->assertSame( '2026-02-01', $body['currentStart'] );
		$this->assertSame( '2026-02-28', $body['currentEnd'] );
		$this->assertSame( '2026-01-01', $body['previousStart'] );
		$this->assertSame( '2026-01-31', $body['previousEnd'] );
	}

	public function test_generate_sanitizes_response(): void {
		$_POST['preset'] = 'this_month';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_comparison_data() )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'cccc0000-1111-2222-3333-444455556666', $result->data['id'] );
		$this->assertSame( 'this_month', $result->data['preset'] );
		$this->assertIsArray( $result->data['metrics'] );
		$this->assertEqualsWithDelta( 12500.00, $result->data['metrics']['current']['revenue'], 0.01 );
		$this->assertSame( 150, $result->data['metrics']['current']['orderCount'] );
		$this->assertEqualsWithDelta( 2300.00, $result->data['metrics']['revenueChange'], 0.01 );
		$this->assertSame( 'up', $result->data['metrics']['trend'] );
		$this->assertIsArray( $result->data['breakdown'] );
		$this->assertCount( 2, $result->data['breakdown'] );
		$this->assertSame( '2026-02-01', $result->data['breakdown'][0]['date'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// LIST (handle_list_comparisons)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_list_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'comparisons' => array() ) )
		);

		$this->call_handler( 'handle_list_comparisons' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_list_checks_permissions(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_list_comparisons' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	public function test_list_fails_when_not_connected(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_list_comparisons' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not connected', $result->data['message'] );
	}

	public function test_list_returns_comparisons(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array(
				'success' => true,
				'data'    => array(
					'comparisons' => array(
						$this->make_comparison_data(),
						$this->make_comparison_data( array( 'id' => 'dddd0000-1111-2222-3333-444455557777', 'preset' => 'this_week' ) ),
					),
				),
			)
		);

		$result = $this->call_handler( 'handle_list_comparisons' );

		$this->assertTrue( $result->success );
		$this->assertCount( 2, $result->data['comparisons'] );
		$this->assertSame( 'cccc0000-1111-2222-3333-444455556666', $result->data['comparisons'][0]['id'] );
		$this->assertSame( 'dddd0000-1111-2222-3333-444455557777', $result->data['comparisons'][1]['id'] );
	}

	public function test_list_returns_empty_array(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'comparisons' => array() ) )
		);

		$result = $this->call_handler( 'handle_list_comparisons' );

		$this->assertTrue( $result->success );
		$this->assertEmpty( $result->data['comparisons'] );
	}

	public function test_list_handles_api_error(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'http_request_failed', 'Timeout' );

		$result = $this->call_handler( 'handle_list_comparisons' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Unable to connect', $result->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// GET (handle_get_comparison)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_get_checks_nonce(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => $this->make_comparison_data() )
		);

		$this->call_handler( 'handle_get_comparison' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_get_checks_permissions(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_get_comparison' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	public function test_get_requires_comparison_id(): void {
		$result = $this->call_handler( 'handle_get_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Comparison ID is required', $result->data['message'] );
	}

	public function test_get_rejects_invalid_comparison_id_format(): void {
		$_POST['comparisonId'] = 'invalid<script>format';

		$result = $this->call_handler( 'handle_get_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Invalid comparison ID format', $result->data['message'] );
	}

	public function test_get_fails_when_not_connected(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_get_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not connected', $result->data['message'] );
	}

	public function test_get_returns_comparison(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => $this->make_comparison_data() )
		);

		$result = $this->call_handler( 'handle_get_comparison' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'cccc0000-1111-2222-3333-444455556666', $result->data['id'] );
		$this->assertSame( 'this_month', $result->data['preset'] );
	}

	public function test_get_handles_api_error(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'http_request_failed', 'Timeout' );

		$result = $this->call_handler( 'handle_get_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Unable to connect', $result->data['message'] );
	}

	public function test_get_handles_404_response(): void {
		$_POST['comparisonId'] = '00000000-0000-0000-0000-000000009999';

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			404,
			array( 'success' => false, 'error' => array( 'message' => 'Comparison not found' ) )
		);

		$result = $this->call_handler( 'handle_get_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not found', $result->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// DELETE (handle_delete_comparison)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_delete_checks_nonce(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'deleted' => true ) )
		);

		$this->call_handler( 'handle_delete_comparison' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_delete_checks_permissions(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_delete_comparison' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	public function test_delete_requires_comparison_id(): void {
		$result = $this->call_handler( 'handle_delete_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Comparison ID is required', $result->data['message'] );
	}

	public function test_delete_rejects_invalid_comparison_id_format(): void {
		$_POST['comparisonId'] = 'invalid<script>format';

		$result = $this->call_handler( 'handle_delete_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Invalid comparison ID format', $result->data['message'] );
	}

	public function test_delete_fails_when_not_connected(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_delete_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not connected', $result->data['message'] );
	}

	public function test_delete_returns_success(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'deleted' => true ) )
		);

		$result = $this->call_handler( 'handle_delete_comparison' );

		$this->assertTrue( $result->success );
		$this->assertTrue( $result->data['deleted'] );
	}

	public function test_delete_handles_api_error(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => new WP_Error( 'http_request_failed', 'Timeout' );

		$result = $this->call_handler( 'handle_delete_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'Unable to connect', $result->data['message'] );
	}

	public function test_delete_handles_404_response(): void {
		$_POST['comparisonId'] = '00000000-0000-0000-0000-000000009999';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			404,
			array( 'success' => false, 'error' => array( 'message' => 'Comparison not found' ) )
		);

		$result = $this->call_handler( 'handle_delete_comparison' );

		$this->assertFalse( $result->success );
		$this->assertStringContainsString( 'not found', $result->data['message'] );
	}

	public function test_delete_uses_correct_http_method(): void {
		$_POST['comparisonId'] = 'cccc0000-1111-2222-3333-444455556666';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				200,
				array( 'success' => true, 'data' => array( 'deleted' => true ) )
			);
		};

		$this->call_handler( 'handle_delete_comparison' );

		$this->assertNotNull( $captured_args );
		$this->assertSame( 'DELETE', $captured_args['method'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Sanitization
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_sanitize_comparison_handles_non_array_data(): void {
		$_POST['preset'] = 'this_month';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => 'not-an-array' )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
		$this->assertEmpty( $result->data );
	}

	public function test_sanitize_comparison_handles_missing_fields(): void {
		$_POST['preset'] = 'this_month';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => array( 'id' => 'test-123' ) )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'test-123', $result->data['id'] );
		$this->assertNull( $result->data['preset'] );
		$this->assertSame( 'flat', $result->data['metrics']['trend'] );
		$this->assertEmpty( $result->data['breakdown'] );
	}

	public function test_sanitize_comparison_validates_trend_values(): void {
		$_POST['preset'] = 'this_month';

		$data = $this->make_comparison_data();
		$data['metrics']['trend'] = 'invalid_trend';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $data )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'flat', $result->data['metrics']['trend'] );
	}

	public function test_sanitize_comparison_skips_non_array_breakdown_rows(): void {
		$_POST['preset'] = 'this_month';

		$data = $this->make_comparison_data();
		$data['breakdown'] = array(
			array( 'date' => '2026-02-01', 'currentRevenue' => 450.00, 'previousRevenue' => 380.00 ),
			'not-an-array',
			array( 'date' => '2026-02-02', 'currentRevenue' => 520.00, 'previousRevenue' => 410.00 ),
		);

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $data )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
		$this->assertCount( 2, $result->data['breakdown'] );
	}

	public function test_sanitize_comparison_handles_null_preset(): void {
		$_POST['currentStart']  = '2026-02-01';
		$_POST['currentEnd']    = '2026-02-28';
		$_POST['previousStart'] = '2026-01-01';
		$_POST['previousEnd']   = '2026-01-31';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_comparison_data( array( 'preset' => null ) ) )
		);

		$result = $this->call_handler( 'handle_generate_comparison' );

		$this->assertTrue( $result->success );
		// When preset is null, sanitize_text_field returns empty string which we treat as null
		$this->assertNotNull( $result->data );
	}
}
