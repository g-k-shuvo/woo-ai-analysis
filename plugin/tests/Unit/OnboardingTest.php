<?php
/**
 * Unit tests for the Onboarding class.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics\Tests\Unit;

use PHPUnit\Framework\TestCase;
use WP_Ajax_Response_Exception;
use WP_Stubs;
use WooAIAnalytics\Onboarding;
use ReflectionClass;

/**
 * Tests for Onboarding AJAX endpoints and options.
 */
final class OnboardingTest extends TestCase {

	private Onboarding $onboarding;

	protected function setUp(): void {
		parent::setUp();
		WP_Stubs::reset();

		// Reset singleton.
		$ref  = new ReflectionClass( Onboarding::class );
		$prop = $ref->getProperty( 'instance' );
		$prop->setAccessible( true );
		$prop->setValue( null, null );

		$this->onboarding = Onboarding::get_instance();
	}

	protected function tearDown(): void {
		WP_Stubs::reset();
		$_POST = array();
		parent::tearDown();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	private function call_handler( string $method ): WP_Ajax_Response_Exception {
		try {
			$this->onboarding->$method();
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

	public function test_registers_all_onboarding_actions(): void {
		$action_names = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'wp_ajax_waa_complete_onboarding', $action_names );
		$this->assertContains( 'wp_ajax_waa_dismiss_onboarding', $action_names );
		$this->assertContains( 'wp_ajax_waa_onboarding_status', $action_names );
	}

	// ─── is_completed / is_dismissed Static Methods ─────────────────────────────

	public function test_is_completed_returns_false_by_default(): void {
		$this->assertFalse( Onboarding::is_completed() );
	}

	public function test_is_completed_returns_true_when_option_set(): void {
		WP_Stubs::$options['waa_onboarding_completed'] = true;
		$this->assertTrue( Onboarding::is_completed() );
	}

	public function test_is_dismissed_returns_false_by_default(): void {
		$this->assertFalse( Onboarding::is_dismissed() );
	}

	public function test_is_dismissed_returns_true_when_option_set(): void {
		WP_Stubs::$options['waa_onboarding_dismissed'] = true;
		$this->assertTrue( Onboarding::is_dismissed() );
	}

	// ─── handle_complete_onboarding ──────────────────────────────────────────────

	public function test_complete_onboarding_sets_option_and_returns_success(): void {
		$result = $this->call_handler( 'handle_complete_onboarding' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'Onboarding completed.', $result->data['message'] );
		$this->assertTrue( WP_Stubs::$options['waa_onboarding_completed'] );
	}

	public function test_complete_onboarding_checks_nonce(): void {
		$this->call_handler( 'handle_complete_onboarding' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
		$this->assertSame( 'nonce', $nonce_calls[0][1] );
	}

	public function test_complete_onboarding_rejects_unauthorized_user(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_complete_onboarding' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
		$this->assertSame( 403, $result->status_code );
	}

	// ─── handle_dismiss_onboarding ───────────────────────────────────────────────

	public function test_dismiss_onboarding_sets_option_and_returns_success(): void {
		$result = $this->call_handler( 'handle_dismiss_onboarding' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'Onboarding dismissed.', $result->data['message'] );
		$this->assertTrue( WP_Stubs::$options['waa_onboarding_dismissed'] );
	}

	public function test_dismiss_onboarding_checks_nonce(): void {
		$this->call_handler( 'handle_dismiss_onboarding' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	public function test_dismiss_onboarding_rejects_unauthorized_user(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_dismiss_onboarding' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
		$this->assertSame( 403, $result->status_code );
	}

	// ─── handle_onboarding_status ────────────────────────────────────────────────

	public function test_onboarding_status_returns_not_connected_when_no_api_url(): void {
		// No api_url or store_api_key options set.
		$result = $this->call_handler( 'handle_onboarding_status' );

		$this->assertTrue( $result->success );
		$this->assertFalse( $result->data['connected'] );
		$this->assertFalse( $result->data['hasSyncedData'] );
		$this->assertSame( 0, $result->data['recordCounts']['orders'] );
		$this->assertSame( 0, $result->data['recordCounts']['products'] );
		$this->assertSame( 0, $result->data['recordCounts']['customers'] );
		$this->assertSame( 0, $result->data['recordCounts']['categories'] );
	}

	public function test_onboarding_status_proxies_to_backend(): void {
		WP_Stubs::$options['waa_api_url']      = 'https://api.example.com';
		WP_Stubs::$options['waa_store_api_key'] = $this->make_encrypted_key( 'test-key' );

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array(
				'success' => true,
				'data'    => array(
					'connected'     => true,
					'hasSyncedData' => true,
					'recordCounts'  => array(
						'orders'     => 100,
						'products'   => 30,
						'customers'  => 50,
						'categories' => 8,
					),
				),
			)
		);

		$result = $this->call_handler( 'handle_onboarding_status' );

		$this->assertTrue( $result->success );
		$this->assertTrue( $result->data['connected'] );
		$this->assertTrue( $result->data['hasSyncedData'] );
		$this->assertSame( 100, $result->data['recordCounts']['orders'] );
	}

	public function test_onboarding_status_calls_correct_endpoint(): void {
		WP_Stubs::$options['waa_api_url']      = 'https://api.example.com';
		WP_Stubs::$options['waa_store_api_key'] = $this->make_encrypted_key( 'test-key' );

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array() )
		);

		$this->call_handler( 'handle_onboarding_status' );

		$get_calls = WP_Stubs::$calls['wp_remote_get'] ?? array();
		$this->assertNotEmpty( $get_calls );
		$this->assertSame(
			'https://api.example.com/api/stores/onboarding-status',
			$get_calls[0][0]
		);
	}

	public function test_onboarding_status_sends_auth_header(): void {
		WP_Stubs::$options['waa_api_url']      = 'https://api.example.com';
		WP_Stubs::$options['waa_store_api_key'] = $this->make_encrypted_key( 'test-key' );

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array() )
		);

		$this->call_handler( 'handle_onboarding_status' );

		$get_calls = WP_Stubs::$calls['wp_remote_get'] ?? array();
		$this->assertNotEmpty( $get_calls );
		$headers = $get_calls[0][1]['headers'] ?? array();
		$this->assertArrayHasKey( 'Authorization', $headers );
		$this->assertStringStartsWith( 'Bearer ', $headers['Authorization'] );
	}

	public function test_onboarding_status_handles_backend_error(): void {
		WP_Stubs::$options['waa_api_url']      = 'https://api.example.com';
		WP_Stubs::$options['waa_store_api_key'] = $this->make_encrypted_key( 'test-key' );

		WP_Stubs::$overrides['wp_remote_get'] = fn() => new \WP_Error( 'timeout', 'Request timed out' );

		$result = $this->call_handler( 'handle_onboarding_status' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Request timed out', $result->data['message'] );
	}

	public function test_onboarding_status_handles_non_200_response(): void {
		WP_Stubs::$options['waa_api_url']      = 'https://api.example.com';
		WP_Stubs::$options['waa_store_api_key'] = $this->make_encrypted_key( 'test-key' );

		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			500,
			array( 'success' => false, 'error' => array( 'message' => 'Internal server error' ) )
		);

		$result = $this->call_handler( 'handle_onboarding_status' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Internal server error', $result->data['message'] );
	}

	public function test_onboarding_status_rejects_unauthorized_user(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_onboarding_status' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
		$this->assertSame( 403, $result->status_code );
	}

	public function test_onboarding_status_checks_nonce(): void {
		$this->call_handler( 'handle_onboarding_status' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	// ─── Singleton ───────────────────────────────────────────────────────────────

	public function test_singleton_returns_same_instance(): void {
		$a = Onboarding::get_instance();
		$b = Onboarding::get_instance();
		$this->assertSame( $a, $b );
	}

	// ─── Encryption Helper ──────────────────────────────────────────────────────

	private function make_encrypted_key( string $plain_key ): string {
		$key    = hash( 'sha256', wp_salt( 'auth' ), true );
		$iv     = openssl_random_pseudo_bytes( 16 );
		$cipher = openssl_encrypt( $plain_key, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv );
		return base64_encode( $iv . $cipher );
	}
}
