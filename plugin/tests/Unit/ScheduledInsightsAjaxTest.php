<?php
/**
 * Unit tests for Scheduled Insights AJAX handlers in Ajax_Handler.
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
 * Tests for Ajax_Handler scheduled insights endpoints.
 */
final class ScheduledInsightsAjaxTest extends TestCase {

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

	private function make_insight_data( array $overrides = array() ): array {
		return array_merge(
			array(
				'id'        => 'insight-abc-123',
				'name'      => 'Daily Revenue Summary',
				'frequency' => 'daily',
				'hour'      => 8,
				'dayOfWeek' => null,
				'enabled'   => true,
				'lastRunAt' => null,
				'nextRunAt' => '2026-02-13T08:00:00.000Z',
				'createdAt' => '2026-02-12T10:00:00.000Z',
				'updatedAt' => '2026-02-12T10:00:00.000Z',
			),
			$overrides
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Action Registration
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_registers_create_scheduled_insight_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_create_scheduled_insight'
		);
		$this->assertNotEmpty( $hooks );
	}

	public function test_registers_list_scheduled_insights_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_list_scheduled_insights'
		);
		$this->assertNotEmpty( $hooks );
	}

	public function test_registers_update_scheduled_insight_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_update_scheduled_insight'
		);
		$this->assertNotEmpty( $hooks );
	}

	public function test_registers_delete_scheduled_insight_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_delete_scheduled_insight'
		);
		$this->assertNotEmpty( $hooks );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// CREATE (handle_create_scheduled_insight)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_create_checks_nonce(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_insight_data() )
		);

		$this->call_handler( 'handle_create_scheduled_insight' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_create_rejects_no_permission(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	public function test_create_requires_name(): void {
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Name is required.', $e->data['message'] );
	}

	public function test_create_requires_valid_frequency(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'monthly';
		$_POST['hour']      = '8';

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Frequency must be daily or weekly.', $e->data['message'] );
	}

	public function test_create_rejects_hour_above_23(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '24';

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Hour must be between 0 and 23.', $e->data['message'] );
	}

	public function test_create_fails_when_not_connected(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';
		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	public function test_create_handles_wp_error(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => new WP_Error( 'timeout', 'Connection timed out' );

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_create_handles_backend_error(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			400,
			array( 'success' => false, 'error' => array( 'message' => 'Maximum of 5 scheduled insights allowed per store' ) )
		);

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Maximum of 5 scheduled insights allowed per store', $e->data['message'] );
	}

	public function test_create_returns_sanitized_insight_on_success(): void {
		$_POST['name']      = 'Daily Revenue';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array( 'success' => true, 'data' => $this->make_insight_data() )
		);

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertTrue( $e->success );
		$this->assertSame( 'insight-abc-123', $e->data['id'] );
		$this->assertSame( 'Daily Revenue Summary', $e->data['name'] );
		$this->assertSame( 'daily', $e->data['frequency'] );
		$this->assertSame( 8, $e->data['hour'] );
		$this->assertTrue( $e->data['enabled'] );
	}

	public function test_create_sends_correct_request_url(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		$captured_url = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return $this->make_json_response(
				201,
				array( 'success' => true, 'data' => $this->make_insight_data() )
			);
		};

		$this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertSame( 'https://api.example.com/api/scheduled-insights', $captured_url );
	}

	public function test_create_sends_weekly_dayOfWeek(): void {
		$_POST['name']      = 'Weekly';
		$_POST['frequency'] = 'weekly';
		$_POST['hour']      = '9';
		$_POST['dayOfWeek'] = '1';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				201,
				array( 'success' => true, 'data' => $this->make_insight_data( array( 'frequency' => 'weekly', 'dayOfWeek' => 1 ) ) )
			);
		};

		$this->call_handler( 'handle_create_scheduled_insight' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertSame( 1, $body['dayOfWeek'] );
		$this->assertSame( 'weekly', $body['frequency'] );
	}

	public function test_create_sends_enabled_flag(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';
		$_POST['enabled']   = 'false';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_post'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				201,
				array( 'success' => true, 'data' => $this->make_insight_data( array( 'enabled' => false ) ) )
			);
		};

		$this->call_handler( 'handle_create_scheduled_insight' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertFalse( $body['enabled'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// LIST (handle_list_scheduled_insights)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_list_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'insights' => array() ) )
		);

		$this->call_handler( 'handle_list_scheduled_insights' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_list_rejects_no_permission(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_list_scheduled_insights' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	public function test_list_fails_when_not_connected(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_list_scheduled_insights' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	public function test_list_handles_wp_error(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'timeout', 'Timeout' );

		$e = $this->call_handler( 'handle_list_scheduled_insights' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_list_returns_insights_on_success(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array(
				'success' => true,
				'data'    => array(
					'insights' => array(
						$this->make_insight_data(),
						$this->make_insight_data( array( 'id' => 'insight-def-456', 'name' => 'Weekly Digest' ) ),
					),
				),
			)
		);

		$e = $this->call_handler( 'handle_list_scheduled_insights' );

		$this->assertTrue( $e->success );
		$this->assertCount( 2, $e->data['insights'] );
		$this->assertSame( 'insight-abc-123', $e->data['insights'][0]['id'] );
		$this->assertSame( 'insight-def-456', $e->data['insights'][1]['id'] );
	}

	public function test_list_returns_empty_array_when_no_insights(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'insights' => array() ) )
		);

		$e = $this->call_handler( 'handle_list_scheduled_insights' );

		$this->assertTrue( $e->success );
		$this->assertEmpty( $e->data['insights'] );
	}

	public function test_list_sends_correct_url(): void {
		$captured_url = null;
		WP_Stubs::$overrides['wp_remote_get'] = function ( $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return $this->make_json_response(
				200,
				array( 'success' => true, 'data' => array( 'insights' => array() ) )
			);
		};

		$this->call_handler( 'handle_list_scheduled_insights' );

		$this->assertSame( 'https://api.example.com/api/scheduled-insights', $captured_url );
	}

	public function test_list_handles_backend_error(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			500,
			array( 'success' => false, 'error' => array( 'message' => 'Internal server error' ) )
		);

		$e = $this->call_handler( 'handle_list_scheduled_insights' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Internal server error', $e->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// UPDATE (handle_update_scheduled_insight)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_update_checks_nonce(): void {
		$_POST['insightId'] = 'insight-abc-123';
		$_POST['name']      = 'Updated';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => $this->make_insight_data( array( 'name' => 'Updated' ) ) )
		);

		$this->call_handler( 'handle_update_scheduled_insight' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_update_rejects_no_permission(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_update_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	public function test_update_requires_insight_id(): void {
		$e = $this->call_handler( 'handle_update_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Insight ID is required.', $e->data['message'] );
	}

	public function test_update_fails_when_not_connected(): void {
		$_POST['insightId'] = 'insight-abc-123';
		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_update_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	public function test_update_handles_wp_error(): void {
		$_POST['insightId'] = 'insight-abc-123';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => new WP_Error( 'timeout', 'Timeout' );

		$e = $this->call_handler( 'handle_update_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_update_returns_updated_insight(): void {
		$_POST['insightId'] = 'insight-abc-123';
		$_POST['name']      = 'Updated Name';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => $this->make_insight_data( array( 'name' => 'Updated Name' ) ) )
		);

		$e = $this->call_handler( 'handle_update_scheduled_insight' );

		$this->assertTrue( $e->success );
		$this->assertSame( 'Updated Name', $e->data['name'] );
	}

	public function test_update_sends_correct_url(): void {
		$_POST['insightId'] = 'insight-abc-123';
		$_POST['enabled']   = 'false';

		$captured_url = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return $this->make_json_response(
				200,
				array( 'success' => true, 'data' => $this->make_insight_data() )
			);
		};

		$this->call_handler( 'handle_update_scheduled_insight' );

		$this->assertSame( 'https://api.example.com/api/scheduled-insights/insight-abc-123', $captured_url );
	}

	public function test_update_uses_put_method(): void {
		$_POST['insightId'] = 'insight-abc-123';
		$_POST['name']      = 'Test';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				200,
				array( 'success' => true, 'data' => $this->make_insight_data() )
			);
		};

		$this->call_handler( 'handle_update_scheduled_insight' );

		$this->assertSame( 'PUT', $captured_args['method'] );
	}

	public function test_update_sends_only_provided_fields(): void {
		$_POST['insightId'] = 'insight-abc-123';
		$_POST['enabled']   = 'false';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				200,
				array( 'success' => true, 'data' => $this->make_insight_data() )
			);
		};

		$this->call_handler( 'handle_update_scheduled_insight' );

		$body = json_decode( $captured_args['body'], true );
		$this->assertFalse( $body['enabled'] );
		$this->assertArrayNotHasKey( 'name', $body );
	}

	public function test_update_handles_not_found(): void {
		$_POST['insightId'] = 'nonexistent';
		$_POST['name']      = 'Test';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			404,
			array( 'success' => false, 'error' => array( 'message' => 'Scheduled insight not found' ) )
		);

		$e = $this->call_handler( 'handle_update_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Scheduled insight not found', $e->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// DELETE (handle_delete_scheduled_insight)
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_delete_checks_nonce(): void {
		$_POST['insightId'] = 'insight-abc-123';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'deleted' => true ) )
		);

		$this->call_handler( 'handle_delete_scheduled_insight' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_delete_rejects_no_permission(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$e = $this->call_handler( 'handle_delete_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Permission denied.', $e->data['message'] );
	}

	public function test_delete_requires_insight_id(): void {
		$e = $this->call_handler( 'handle_delete_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Insight ID is required.', $e->data['message'] );
	}

	public function test_delete_fails_when_not_connected(): void {
		$_POST['insightId'] = 'insight-abc-123';
		WP_Stubs::$options['waa_api_url'] = '';

		$e = $this->call_handler( 'handle_delete_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Store is not connected.', $e->data['message'] );
	}

	public function test_delete_handles_wp_error(): void {
		$_POST['insightId'] = 'insight-abc-123';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => new WP_Error( 'timeout', 'Timeout' );

		$e = $this->call_handler( 'handle_delete_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Unable to connect to analytics service.', $e->data['message'] );
	}

	public function test_delete_returns_success(): void {
		$_POST['insightId'] = 'insight-abc-123';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			200,
			array( 'success' => true, 'data' => array( 'deleted' => true ) )
		);

		$e = $this->call_handler( 'handle_delete_scheduled_insight' );

		$this->assertTrue( $e->success );
		$this->assertTrue( $e->data['deleted'] );
	}

	public function test_delete_sends_correct_url(): void {
		$_POST['insightId'] = 'insight-abc-123';

		$captured_url = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return $this->make_json_response(
				200,
				array( 'success' => true, 'data' => array( 'deleted' => true ) )
			);
		};

		$this->call_handler( 'handle_delete_scheduled_insight' );

		$this->assertSame( 'https://api.example.com/api/scheduled-insights/insight-abc-123', $captured_url );
	}

	public function test_delete_uses_delete_method(): void {
		$_POST['insightId'] = 'insight-abc-123';

		$captured_args = null;
		WP_Stubs::$overrides['wp_remote_request'] = function ( $url, $args ) use ( &$captured_args ) {
			$captured_args = $args;
			return $this->make_json_response(
				200,
				array( 'success' => true, 'data' => array( 'deleted' => true ) )
			);
		};

		$this->call_handler( 'handle_delete_scheduled_insight' );

		$this->assertSame( 'DELETE', $captured_args['method'] );
	}

	public function test_delete_handles_not_found(): void {
		$_POST['insightId'] = 'nonexistent';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			404,
			array( 'success' => false, 'error' => array( 'message' => 'Scheduled insight not found' ) )
		);

		$e = $this->call_handler( 'handle_delete_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Scheduled insight not found', $e->data['message'] );
	}

	public function test_delete_handles_default_error_message(): void {
		$_POST['insightId'] = 'insight-abc-123';

		WP_Stubs::$overrides['wp_remote_request'] = fn() => $this->make_json_response(
			500,
			array( 'success' => false )
		);

		$e = $this->call_handler( 'handle_delete_scheduled_insight' );

		$this->assertFalse( $e->success );
		$this->assertSame( 'Failed to delete scheduled insight.', $e->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// Sanitization
	// ═══════════════════════════════════════════════════════════════════════════

	public function test_create_sanitizes_response_data(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array(
				'success' => true,
				'data'    => $this->make_insight_data( array(
					'name' => '<script>alert("xss")</script>Revenue',
				) ),
			)
		);

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertTrue( $e->success );
		$this->assertStringNotContainsString( '<script>', $e->data['name'] );
	}

	public function test_list_sanitizes_insight_responses(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_json_response(
			200,
			array(
				'success' => true,
				'data'    => array(
					'insights' => array(
						$this->make_insight_data( array( 'name' => '<b>Bold</b> Name' ) ),
					),
				),
			)
		);

		$e = $this->call_handler( 'handle_list_scheduled_insights' );

		$this->assertTrue( $e->success );
		$this->assertStringNotContainsString( '<b>', $e->data['insights'][0]['name'] );
	}

	public function test_sanitize_handles_null_dayOfWeek(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array(
				'success' => true,
				'data'    => $this->make_insight_data( array( 'dayOfWeek' => null ) ),
			)
		);

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertTrue( $e->success );
		$this->assertNull( $e->data['dayOfWeek'] );
	}

	public function test_sanitize_casts_enabled_to_bool(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array(
				'success' => true,
				'data'    => $this->make_insight_data( array( 'enabled' => 1 ) ),
			)
		);

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertTrue( $e->success );
		$this->assertTrue( $e->data['enabled'] );
	}

	public function test_sanitize_handles_null_lastRunAt(): void {
		$_POST['name']      = 'Test';
		$_POST['frequency'] = 'daily';
		$_POST['hour']      = '8';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_json_response(
			201,
			array(
				'success' => true,
				'data'    => $this->make_insight_data( array( 'lastRunAt' => null ) ),
			)
		);

		$e = $this->call_handler( 'handle_create_scheduled_insight' );

		$this->assertTrue( $e->success );
		$this->assertNull( $e->data['lastRunAt'] );
	}
}
