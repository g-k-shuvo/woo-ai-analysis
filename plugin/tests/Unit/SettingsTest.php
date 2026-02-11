<?php
/**
 * Unit tests for the Settings class.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics\Tests\Unit;

use PHPUnit\Framework\TestCase;
use WP_Ajax_Response_Exception;
use WP_Error;
use WP_Stubs;
use WooAIAnalytics\Settings;
use ReflectionClass;

/**
 * Tests for Settings AJAX endpoints.
 */
final class SettingsTest extends TestCase {

	private Settings $settings;

	protected function setUp(): void {
		parent::setUp();
		WP_Stubs::reset();

		// Reset singleton.
		$ref = new ReflectionClass( Settings::class );
		$prop = $ref->getProperty( 'instance' );
		$prop->setAccessible( true );
		$prop->setValue( null, null );

		$this->settings = Settings::get_instance();

		// Default: store is connected.
		WP_Stubs::$options['waa_api_url']       = 'https://api.example.com';
		WP_Stubs::$options['waa_store_api_key']  = $this->make_encrypted_key( 'test-key-123' );
		WP_Stubs::$options['waa_store_id']       = 'store-abc';
		WP_Stubs::$options['waa_connected']      = true;
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
			$this->settings->$method();
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

	// ─── Constructor / Hook Registration ─────────────────────────────────────────

	public function test_registers_all_settings_actions(): void {
		$action_names = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array()
		);

		$expected = array(
			'wp_ajax_waa_save_settings',
			'wp_ajax_waa_test_connection',
			'wp_ajax_waa_connect',
			'wp_ajax_waa_disconnect',
			'wp_ajax_waa_sync_status',
		);

		foreach ( $expected as $action ) {
			$this->assertContains( $action, $action_names, "Action {$action} should be registered" );
		}
	}

	public function test_singleton_returns_same_instance(): void {
		$a = Settings::get_instance();
		$b = Settings::get_instance();

		$this->assertSame( $a, $b );
	}

	// ═══════════════════════════════════════════════════════════════════════════════
	// handle_save_settings
	// ═══════════════════════════════════════════════════════════════════════════════

	public function test_save_settings_checks_nonce(): void {
		$_POST['api_url'] = 'https://api.example.com';

		$this->call_handler( 'handle_save_settings' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_save_settings_denies_unauthorized(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;
		$_POST['api_url'] = 'https://api.example.com';

		$result = $this->call_handler( 'handle_save_settings' );

		$this->assertFalse( $result->success );
		$this->assertSame( 403, $result->status_code );
	}

	public function test_save_settings_requires_api_url(): void {
		$_POST['api_url'] = '';

		$result = $this->call_handler( 'handle_save_settings' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'API URL is required.', $result->data['message'] );
	}

	public function test_save_settings_stores_url(): void {
		$_POST['api_url'] = 'https://api.newbackend.com';

		$result = $this->call_handler( 'handle_save_settings' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'https://api.newbackend.com', WP_Stubs::$options['waa_api_url'] );
	}

	public function test_save_settings_returns_success_message(): void {
		$_POST['api_url'] = 'https://api.example.com';

		$result = $this->call_handler( 'handle_save_settings' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'Settings saved.', $result->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════════
	// handle_test_connection
	// ═══════════════════════════════════════════════════════════════════════════════

	public function test_test_connection_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'status' => 'ok', 'version' => '1.0.0' )
		);

		$this->call_handler( 'handle_test_connection' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_test_connection_denies_unauthorized(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_test_connection' );

		$this->assertFalse( $result->success );
		$this->assertSame( 403, $result->status_code );
	}

	public function test_test_connection_requires_saved_url(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_test_connection' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Please save an API URL first.', $result->data['message'] );
	}

	public function test_test_connection_calls_health_endpoint(): void {
		$captured_url = '';

		WP_Stubs::$overrides['wp_remote_get'] = function ( string $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return $this->make_response( 200, array( 'status' => 'ok', 'version' => '1.0.0' ) );
		};

		$this->call_handler( 'handle_test_connection' );

		$this->assertSame( 'https://api.example.com/health', $captured_url );
	}

	public function test_test_connection_sets_connected_on_success(): void {
		WP_Stubs::$options['waa_connected'] = false;

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'status' => 'ok', 'version' => '2.0.0' )
		);

		$result = $this->call_handler( 'handle_test_connection' );

		$this->assertTrue( $result->success );
		$this->assertTrue( WP_Stubs::$options['waa_connected'] );
		$this->assertSame( '2.0.0', $result->data['version'] );
	}

	public function test_test_connection_sets_disconnected_on_wp_error(): void {
		WP_Stubs::$options['waa_connected'] = true;

		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'fail', 'Connection refused' );

		$result = $this->call_handler( 'handle_test_connection' );

		$this->assertFalse( $result->success );
		$this->assertFalse( WP_Stubs::$options['waa_connected'] );
	}

	public function test_test_connection_sets_disconnected_on_bad_health(): void {
		WP_Stubs::$options['waa_connected'] = true;

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'status' => 'degraded' )
		);

		$result = $this->call_handler( 'handle_test_connection' );

		$this->assertFalse( $result->success );
		$this->assertFalse( WP_Stubs::$options['waa_connected'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════════
	// handle_connect
	// ═══════════════════════════════════════════════════════════════════════════════

	public function test_connect_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array( 'success' => true, 'data' => array( 'storeId' => 'new-id' ) )
		);

		$this->call_handler( 'handle_connect' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_connect_denies_unauthorized(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_connect' );

		$this->assertFalse( $result->success );
		$this->assertSame( 403, $result->status_code );
	}

	public function test_connect_requires_api_url(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_connect' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Please save an API URL first.', $result->data['message'] );
	}

	public function test_connect_posts_to_stores_connect(): void {
		$captured_url = '';

		WP_Stubs::$overrides['wp_remote_post'] = function ( string $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return $this->make_response(
				201,
				array( 'success' => true, 'data' => array( 'storeId' => 'new-id' ) )
			);
		};

		$this->call_handler( 'handle_connect' );

		$this->assertSame( 'https://api.example.com/api/stores/connect', $captured_url );
	}

	public function test_connect_sends_store_url_and_api_key(): void {
		$captured_body = '';

		WP_Stubs::$overrides['wp_remote_post'] = function ( string $url, array $args ) use ( &$captured_body ) {
			$captured_body = $args['body'];
			return $this->make_response(
				201,
				array( 'success' => true, 'data' => array( 'storeId' => 'new-id' ) )
			);
		};

		$this->call_handler( 'handle_connect' );

		$decoded = json_decode( $captured_body, true );
		$this->assertSame( 'https://example.com', $decoded['storeUrl'] );
		$this->assertNotEmpty( $decoded['apiKey'] );
		$this->assertSame( 64, strlen( $decoded['apiKey'] ) );
	}

	public function test_connect_stores_encrypted_api_key(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array( 'success' => true, 'data' => array( 'storeId' => 'store-123' ) )
		);

		$this->call_handler( 'handle_connect' );

		// The API key should be stored encrypted (not plaintext).
		$stored = WP_Stubs::$options['waa_store_api_key'];
		$this->assertNotEmpty( $stored );
		// Should be base64 encoded (IV + ciphertext).
		$raw = base64_decode( $stored, true );
		$this->assertNotFalse( $raw );
		$this->assertGreaterThan( 16, strlen( $raw ) );
	}

	public function test_connect_stores_store_id(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array( 'success' => true, 'data' => array( 'storeId' => 'store-xyz' ) )
		);

		$this->call_handler( 'handle_connect' );

		$this->assertSame( 'store-xyz', WP_Stubs::$options['waa_store_id'] );
	}

	public function test_connect_sets_connected_true(): void {
		WP_Stubs::$options['waa_connected'] = false;

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array( 'success' => true, 'data' => array( 'storeId' => 'store-123' ) )
		);

		$this->call_handler( 'handle_connect' );

		$this->assertTrue( WP_Stubs::$options['waa_connected'] );
	}

	public function test_connect_returns_success_with_store_id(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			201,
			array( 'success' => true, 'data' => array( 'storeId' => 'store-abc' ) )
		);

		$result = $this->call_handler( 'handle_connect' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'store-abc', $result->data['storeId'] );
		$this->assertSame( 'Connected successfully!', $result->data['message'] );
	}

	public function test_connect_handles_wp_error(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => new WP_Error( 'fail', 'Timeout' );

		$result = $this->call_handler( 'handle_connect' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Timeout', $result->data['message'] );
	}

	public function test_connect_handles_non_201_status(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			409,
			array( 'success' => false, 'error' => array( 'message' => 'Store already exists' ) )
		);

		$result = $this->call_handler( 'handle_connect' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Store already exists', $result->data['message'] );
	}

	public function test_connect_sanitizes_backend_error_message(): void {
		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			409,
			array( 'success' => false, 'error' => array( 'message' => '<script>alert("xss")</script>Store exists' ) )
		);

		$result = $this->call_handler( 'handle_connect' );

		$this->assertFalse( $result->success );
		$this->assertStringNotContainsString( '<script>', $result->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════════
	// handle_disconnect
	// ═══════════════════════════════════════════════════════════════════════════════

	public function test_disconnect_checks_nonce(): void {
		$result = $this->call_handler( 'handle_disconnect' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_disconnect_denies_unauthorized(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_disconnect' );

		$this->assertFalse( $result->success );
		$this->assertSame( 403, $result->status_code );
	}

	public function test_disconnect_calls_backend_delete(): void {
		$this->call_handler( 'handle_disconnect' );

		$remote_calls = WP_Stubs::$calls['wp_remote_request'] ?? array();
		$this->assertNotEmpty( $remote_calls );
		$this->assertSame( 'https://api.example.com/api/stores/disconnect', $remote_calls[0][0] );
		$this->assertSame( 'DELETE', $remote_calls[0][1]['method'] );
	}

	public function test_disconnect_sends_auth_header(): void {
		$this->call_handler( 'handle_disconnect' );

		$remote_calls = WP_Stubs::$calls['wp_remote_request'] ?? array();
		$this->assertArrayHasKey( 'Authorization', $remote_calls[0][1]['headers'] );
		$this->assertStringStartsWith( 'Bearer ', $remote_calls[0][1]['headers']['Authorization'] );
	}

	public function test_disconnect_clears_local_options(): void {
		$this->call_handler( 'handle_disconnect' );

		$this->assertFalse( WP_Stubs::$options['waa_connected'] );
		$this->assertArrayNotHasKey( 'waa_store_api_key', WP_Stubs::$options );
		$this->assertArrayNotHasKey( 'waa_store_id', WP_Stubs::$options );
	}

	public function test_disconnect_succeeds_even_if_backend_fails(): void {
		WP_Stubs::$overrides['wp_remote_request'] = fn() => new WP_Error( 'fail', 'Unreachable' );

		$result = $this->call_handler( 'handle_disconnect' );

		$this->assertTrue( $result->success );
		$this->assertFalse( WP_Stubs::$options['waa_connected'] );
	}

	public function test_disconnect_returns_success_message(): void {
		$result = $this->call_handler( 'handle_disconnect' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'Disconnected.', $result->data['message'] );
	}

	public function test_disconnect_skips_backend_when_not_connected(): void {
		WP_Stubs::$options['waa_api_url']       = '';
		WP_Stubs::$options['waa_store_api_key'] = '';

		$result = $this->call_handler( 'handle_disconnect' );

		$this->assertTrue( $result->success );
		$remote_calls = WP_Stubs::$calls['wp_remote_request'] ?? array();
		$this->assertEmpty( $remote_calls );
	}

	// ═══════════════════════════════════════════════════════════════════════════════
	// handle_sync_status
	// ═══════════════════════════════════════════════════════════════════════════════

	public function test_sync_status_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array(
				'success' => true,
				'data'    => array( 'lastSyncAt' => '2026-01-01T00:00:00Z' ),
			)
		);

		$this->call_handler( 'handle_sync_status' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
	}

	public function test_sync_status_denies_unauthorized(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_sync_status' );

		$this->assertFalse( $result->success );
		$this->assertSame( 403, $result->status_code );
	}

	public function test_sync_status_fails_when_not_connected(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_sync_status' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Store is not connected.', $result->data['message'] );
	}

	public function test_sync_status_calls_correct_endpoint(): void {
		$captured_url = '';

		WP_Stubs::$overrides['wp_remote_get'] = function ( string $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'lastSyncAt' => null ) )
			);
		};

		$this->call_handler( 'handle_sync_status' );

		$this->assertSame( 'https://api.example.com/api/sync/status', $captured_url );
	}

	public function test_sync_status_returns_backend_data(): void {
		$sync_data = array(
			'lastSyncAt'   => '2026-02-12T10:00:00Z',
			'recordCounts' => array(
				'orders'     => 150,
				'products'   => 45,
				'customers'  => 80,
				'categories' => 12,
			),
			'recentSyncs' => array(),
		);

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => $sync_data )
		);

		$result = $this->call_handler( 'handle_sync_status' );

		$this->assertTrue( $result->success );
		$this->assertSame( $sync_data, $result->data );
	}

	public function test_sync_status_handles_wp_error(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'fail', 'Network error' );

		$result = $this->call_handler( 'handle_sync_status' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Network error', $result->data['message'] );
	}

	public function test_sync_status_handles_non_200_response(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			500,
			array( 'success' => false, 'error' => array( 'message' => 'DB unavailable' ) )
		);

		$result = $this->call_handler( 'handle_sync_status' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'DB unavailable', $result->data['message'] );
	}

	// ═══════════════════════════════════════════════════════════════════════════════
	// get_auth_token
	// ═══════════════════════════════════════════════════════════════════════════════

	public function test_get_auth_token_returns_base64_encoded(): void {
		$token = Settings::get_auth_token();

		$this->assertNotEmpty( $token );
		$decoded = base64_decode( $token, true );
		$this->assertNotFalse( $decoded );
	}

	public function test_get_auth_token_contains_site_url_and_key(): void {
		$token   = Settings::get_auth_token();
		$decoded = base64_decode( $token );

		$this->assertSame( 'https://example.com:test-key-123', $decoded );
	}

	public function test_get_auth_token_returns_empty_when_no_key(): void {
		WP_Stubs::$options['waa_store_api_key'] = '';

		$token = Settings::get_auth_token();

		$this->assertSame( '', $token );
	}

	public function test_get_auth_token_returns_empty_for_invalid_encrypted_data(): void {
		WP_Stubs::$options['waa_store_api_key'] = 'not-valid-base64-cipher';

		$token = Settings::get_auth_token();

		$this->assertSame( '', $token );
	}
}
