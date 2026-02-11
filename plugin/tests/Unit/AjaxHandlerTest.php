<?php
/**
 * Unit tests for the Ajax_Handler class.
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
use ReflectionClass;

/**
 * Tests for Ajax_Handler AJAX endpoints.
 */
final class AjaxHandlerTest extends TestCase {

	private Ajax_Handler $handler;

	protected function setUp(): void {
		parent::setUp();
		WP_Stubs::reset();

		// Reset singleton so constructor hooks re-register.
		$ref = new ReflectionClass( Ajax_Handler::class );
		$prop = $ref->getProperty( 'instance' );
		$prop->setAccessible( true );
		$prop->setValue( null, null );

		$this->handler = Ajax_Handler::get_instance();

		// Default: store is connected.
		WP_Stubs::$options['waa_api_url']       = 'https://api.example.com';
		WP_Stubs::$options['waa_store_api_key']  = $this->make_encrypted_key( 'test-api-key-12345' );
	}

	protected function tearDown(): void {
		WP_Stubs::reset();
		$_POST = array();
		parent::tearDown();
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	/**
	 * Encrypt an API key for test options (mirrors Settings::encrypt_api_key).
	 */
	private function make_encrypted_key( string $plain_key ): string {
		$key    = hash( 'sha256', wp_salt( 'auth' ), true );
		$iv     = openssl_random_pseudo_bytes( 16 );
		$cipher = openssl_encrypt( $plain_key, 'aes-256-cbc', $key, OPENSSL_RAW_DATA, $iv );
		return base64_encode( $iv . $cipher );
	}

	/**
	 * Call a handler method and capture the WP_Ajax_Response_Exception.
	 */
	private function call_handler( string $method ): WP_Ajax_Response_Exception {
		try {
			$this->handler->$method();
		} catch ( WP_Ajax_Response_Exception $e ) {
			return $e;
		}
		$this->fail( "Expected WP_Ajax_Response_Exception from {$method}" );
	}

	/**
	 * Build a mock HTTP response array.
	 */
	private function make_response( int $code, array $body ): array {
		return array(
			'response' => array( 'code' => $code, 'message' => 'OK' ),
			'body'     => (string) json_encode( $body ),
		);
	}

	// ─── Constructor / Hook Registration ─────────────────────────────────────────

	public function test_registers_chat_query_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_chat_query'
		);

		$this->assertNotEmpty( $hooks, 'waa_chat_query action should be registered' );
	}

	public function test_registers_chat_suggestions_action(): void {
		$hooks = array_filter(
			WP_Stubs::$calls['add_action'] ?? array(),
			fn( $call ) => $call[0] === 'wp_ajax_waa_chat_suggestions'
		);

		$this->assertNotEmpty( $hooks, 'waa_chat_suggestions action should be registered' );
	}

	public function test_singleton_returns_same_instance(): void {
		$a = Ajax_Handler::get_instance();
		$b = Ajax_Handler::get_instance();

		$this->assertSame( $a, $b );
	}

	// ─── handle_chat_query — Nonce ───────────────────────────────────────────────

	public function test_chat_query_checks_nonce(): void {
		$_POST['question'] = 'What is my revenue?';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'answer' => 'test' ) )
		);

		$this->call_handler( 'handle_chat_query' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
		$this->assertSame( 'nonce', $nonce_calls[0][1] );
	}

	// ─── handle_chat_query — Permission ──────────────────────────────────────────

	public function test_chat_query_denies_unauthorized_user(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;
		$_POST['question'] = 'What is my revenue?';

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 403, $result->status_code );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	public function test_chat_query_checks_manage_woocommerce(): void {
		$_POST['question'] = 'What is my revenue?';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'answer' => 'test' ) )
		);

		$this->call_handler( 'handle_chat_query' );

		$cap_calls = WP_Stubs::$calls['current_user_can'] ?? array();
		$this->assertNotEmpty( $cap_calls );
		$this->assertSame( 'manage_woocommerce', $cap_calls[0][0] );
	}

	// ─── handle_chat_query — Input Validation ────────────────────────────────────

	public function test_chat_query_rejects_empty_question(): void {
		$_POST['question'] = '';

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Question cannot be empty.', $result->data['message'] );
	}

	public function test_chat_query_rejects_missing_question(): void {
		// No $_POST['question'] set.

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Question cannot be empty.', $result->data['message'] );
	}

	public function test_chat_query_sanitizes_question(): void {
		$_POST['question'] = '<script>alert("xss")</script>What is revenue?';

		WP_Stubs::$overrides['wp_remote_post'] = function ( string $url, array $args ) {
			$body = json_decode( $args['body'], true );
			// sanitize_text_field strips tags.
			\PHPUnit\Framework\Assert::assertStringNotContainsString( '<script>', $body['question'] );
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'answer' => 'test' ) )
			);
		};

		$this->call_handler( 'handle_chat_query' );
	}

	// ─── handle_chat_query — Store Not Connected ─────────────────────────────────

	public function test_chat_query_fails_when_api_url_empty(): void {
		$_POST['question']                = 'What is my revenue?';
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Store is not connected.', $result->data['message'] );
	}

	public function test_chat_query_fails_when_api_key_empty(): void {
		$_POST['question']                    = 'What is my revenue?';
		WP_Stubs::$options['waa_store_api_key'] = '';

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Store is not connected.', $result->data['message'] );
	}

	// ─── handle_chat_query — Backend Proxy ───────────────────────────────────────

	public function test_chat_query_posts_to_correct_url(): void {
		$_POST['question'] = 'What is my revenue?';
		$captured_url = '';

		WP_Stubs::$overrides['wp_remote_post'] = function ( string $url, array $args ) use ( &$captured_url ) {
			$captured_url = $url;
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'answer' => '$1000' ) )
			);
		};

		$this->call_handler( 'handle_chat_query' );

		$this->assertSame( 'https://api.example.com/api/chat/query', $captured_url );
	}

	public function test_chat_query_sends_authorization_header(): void {
		$_POST['question'] = 'What is my revenue?';
		$captured_headers = array();

		WP_Stubs::$overrides['wp_remote_post'] = function ( string $url, array $args ) use ( &$captured_headers ) {
			$captured_headers = $args['headers'];
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'answer' => '$1000' ) )
			);
		};

		$this->call_handler( 'handle_chat_query' );

		$this->assertArrayHasKey( 'Authorization', $captured_headers );
		$this->assertStringStartsWith( 'Bearer ', $captured_headers['Authorization'] );
	}

	public function test_chat_query_sends_content_type_json(): void {
		$_POST['question'] = 'What is my revenue?';
		$captured_headers = array();

		WP_Stubs::$overrides['wp_remote_post'] = function ( string $url, array $args ) use ( &$captured_headers ) {
			$captured_headers = $args['headers'];
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'answer' => '$1000' ) )
			);
		};

		$this->call_handler( 'handle_chat_query' );

		$this->assertSame( 'application/json', $captured_headers['Content-Type'] );
	}

	public function test_chat_query_sends_question_in_body(): void {
		$_POST['question'] = 'What are my top products?';
		$captured_body = '';

		WP_Stubs::$overrides['wp_remote_post'] = function ( string $url, array $args ) use ( &$captured_body ) {
			$captured_body = $args['body'];
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'answer' => 'Widget' ) )
			);
		};

		$this->call_handler( 'handle_chat_query' );

		$decoded = json_decode( $captured_body, true );
		$this->assertSame( 'What are my top products?', $decoded['question'] );
	}

	public function test_chat_query_uses_30s_timeout(): void {
		$_POST['question'] = 'What is my revenue?';
		$captured_timeout = 0;

		WP_Stubs::$overrides['wp_remote_post'] = function ( string $url, array $args ) use ( &$captured_timeout ) {
			$captured_timeout = $args['timeout'];
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'answer' => '$1000' ) )
			);
		};

		$this->call_handler( 'handle_chat_query' );

		$this->assertSame( 30, $captured_timeout );
	}

	// ─── handle_chat_query — Successful Response ─────────────────────────────────

	public function test_chat_query_returns_success_with_data(): void {
		$_POST['question'] = 'What is my revenue?';
		$backend_data = array(
			'answer'    => 'Your revenue is $10,000',
			'sql'       => 'SELECT SUM(total) FROM orders WHERE store_id = $1',
			'rows'      => array( array( 'total' => '10000.00' ) ),
			'rowCount'  => 1,
			'durationMs' => 42,
			'chartSpec'  => null,
			'chartConfig' => null,
		);

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => $backend_data )
		);

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertTrue( $result->success );
		$this->assertSame( $backend_data, $result->data );
	}

	public function test_chat_query_returns_chart_data_when_present(): void {
		$_POST['question'] = 'Show revenue trend';
		$backend_data = array(
			'answer'      => 'Here is the trend',
			'sql'         => 'SELECT ...',
			'rows'        => array(),
			'rowCount'    => 5,
			'durationMs'  => 55,
			'chartSpec'   => array( 'type' => 'bar', 'title' => 'Revenue Trend' ),
			'chartConfig' => array( 'type' => 'bar', 'data' => array() ),
		);

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => $backend_data )
		);

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertTrue( $result->success );
		$this->assertSame( 'bar', $result->data['chartSpec']['type'] );
		$this->assertSame( 'Revenue Trend', $result->data['chartSpec']['title'] );
	}

	// ─── handle_chat_query — Error Handling ──────────────────────────────────────

	public function test_chat_query_handles_wp_error(): void {
		$_POST['question'] = 'What is my revenue?';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => new WP_Error( 'http_request_failed', 'Connection timed out' );

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Connection timed out', $result->data['message'] );
	}

	public function test_chat_query_handles_non_200_status(): void {
		$_POST['question'] = 'What is my revenue?';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			500,
			array( 'success' => false, 'error' => array( 'message' => 'Internal Server Error' ) )
		);

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Internal Server Error', $result->data['message'] );
	}

	public function test_chat_query_handles_non_success_body(): void {
		$_POST['question'] = 'What is my revenue?';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			200,
			array( 'success' => false, 'error' => array( 'message' => 'AI pipeline error' ) )
		);

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'AI pipeline error', $result->data['message'] );
	}

	public function test_chat_query_uses_default_error_when_no_message(): void {
		$_POST['question'] = 'What is my revenue?';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => $this->make_response(
			500,
			array( 'success' => false )
		);

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Failed to process question.', $result->data['message'] );
	}

	public function test_chat_query_handles_invalid_json_body(): void {
		$_POST['question'] = 'What is my revenue?';

		WP_Stubs::$overrides['wp_remote_post'] = fn() => array(
			'response' => array( 'code' => 200, 'message' => 'OK' ),
			'body'     => 'not-json',
		);

		$result = $this->call_handler( 'handle_chat_query' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Failed to process question.', $result->data['message'] );
	}

	public function test_chat_query_does_not_call_backend_when_question_empty(): void {
		$_POST['question'] = '';

		$this->call_handler( 'handle_chat_query' );

		$remote_calls = WP_Stubs::$calls['wp_remote_post'] ?? array();
		$this->assertEmpty( $remote_calls );
	}

	public function test_chat_query_does_not_call_backend_when_unauthorized(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;
		$_POST['question'] = 'What is my revenue?';

		$this->call_handler( 'handle_chat_query' );

		$remote_calls = WP_Stubs::$calls['wp_remote_post'] ?? array();
		$this->assertEmpty( $remote_calls );
	}

	// ─── handle_chat_query — Auth Token Format ───────────────────────────────────

	public function test_chat_query_builds_correct_bearer_token(): void {
		$_POST['question'] = 'Test';
		$captured_auth = '';

		WP_Stubs::$overrides['wp_remote_post'] = function ( string $url, array $args ) use ( &$captured_auth ) {
			$captured_auth = $args['headers']['Authorization'];
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'answer' => 'ok' ) )
			);
		};

		$this->call_handler( 'handle_chat_query' );

		$token = str_replace( 'Bearer ', '', $captured_auth );
		$decoded = base64_decode( $token );
		$this->assertStringStartsWith( 'https://example.com:', $decoded );
		$this->assertStringEndsWith( 'test-api-key-12345', $decoded );
	}

	// ─── handle_chat_suggestions — Nonce ─────────────────────────────────────────

	public function test_suggestions_checks_nonce(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array( 'suggestions' => array( 'q1' ) ) )
		);

		$this->call_handler( 'handle_chat_suggestions' );

		$nonce_calls = WP_Stubs::$calls['check_ajax_referer'] ?? array();
		$this->assertNotEmpty( $nonce_calls );
		$this->assertSame( 'waa_nonce', $nonce_calls[0][0] );
	}

	// ─── handle_chat_suggestions — Permission ────────────────────────────────────

	public function test_suggestions_denies_unauthorized_user(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertFalse( $result->success );
		$this->assertSame( 403, $result->status_code );
		$this->assertSame( 'Permission denied.', $result->data['message'] );
	}

	// ─── handle_chat_suggestions — Store Not Connected ───────────────────────────

	public function test_suggestions_fails_when_not_connected(): void {
		WP_Stubs::$options['waa_api_url'] = '';

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Store is not connected.', $result->data['message'] );
	}

	public function test_suggestions_fails_when_api_key_empty(): void {
		WP_Stubs::$options['waa_store_api_key'] = '';

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Store is not connected.', $result->data['message'] );
	}

	// ─── handle_chat_suggestions — Backend Proxy ─────────────────────────────────

	public function test_suggestions_gets_correct_url(): void {
		$captured_url = '';

		WP_Stubs::$overrides['wp_remote_get'] = function ( string $url ) use ( &$captured_url ) {
			$captured_url = $url;
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'suggestions' => array( 'q1' ) ) )
			);
		};

		$this->call_handler( 'handle_chat_suggestions' );

		$this->assertSame( 'https://api.example.com/api/chat/suggestions', $captured_url );
	}

	public function test_suggestions_sends_authorization_header(): void {
		$captured_headers = array();

		WP_Stubs::$overrides['wp_remote_get'] = function ( string $url, array $args ) use ( &$captured_headers ) {
			$captured_headers = $args['headers'];
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'suggestions' => array( 'q1' ) ) )
			);
		};

		$this->call_handler( 'handle_chat_suggestions' );

		$this->assertArrayHasKey( 'Authorization', $captured_headers );
		$this->assertStringStartsWith( 'Bearer ', $captured_headers['Authorization'] );
	}

	public function test_suggestions_uses_10s_timeout(): void {
		$captured_timeout = 0;

		WP_Stubs::$overrides['wp_remote_get'] = function ( string $url, array $args ) use ( &$captured_timeout ) {
			$captured_timeout = $args['timeout'];
			return $this->make_response(
				200,
				array( 'success' => true, 'data' => array( 'suggestions' => array( 'q1' ) ) )
			);
		};

		$this->call_handler( 'handle_chat_suggestions' );

		$this->assertSame( 10, $captured_timeout );
	}

	// ─── handle_chat_suggestions — Successful Response ───────────────────────────

	public function test_suggestions_returns_sanitized_suggestions(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array(
				'success' => true,
				'data'    => array(
					'suggestions' => array(
						'What is my revenue?',
						'Top 5 products?',
						'<b>bold</b> question',
					),
				),
			)
		);

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertTrue( $result->success );
		$this->assertCount( 3, $result->data['suggestions'] );
		$this->assertSame( 'What is my revenue?', $result->data['suggestions'][0] );
		$this->assertSame( 'Top 5 products?', $result->data['suggestions'][1] );
		// HTML tags should be stripped by sanitize_text_field.
		$this->assertSame( 'bold question', $result->data['suggestions'][2] );
	}

	public function test_suggestions_returns_empty_array_when_no_suggestions(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array( 'success' => true, 'data' => array() )
		);

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertTrue( $result->success );
		$this->assertSame( array(), $result->data['suggestions'] );
	}

	// ─── handle_chat_suggestions — Error Handling ────────────────────────────────

	public function test_suggestions_handles_wp_error(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => new WP_Error( 'http_request_failed', 'DNS resolution failed' );

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'DNS resolution failed', $result->data['message'] );
	}

	public function test_suggestions_handles_non_200_status(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			500,
			array( 'success' => false, 'error' => array( 'message' => 'Server error' ) )
		);

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Server error', $result->data['message'] );
	}

	public function test_suggestions_uses_default_error_when_no_message(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			500,
			array( 'success' => false )
		);

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Failed to fetch suggestions.', $result->data['message'] );
	}

	public function test_suggestions_does_not_call_backend_when_unauthorized(): void {
		WP_Stubs::$overrides['current_user_can'] = fn() => false;

		$this->call_handler( 'handle_chat_suggestions' );

		$remote_calls = WP_Stubs::$calls['wp_remote_get'] ?? array();
		$this->assertEmpty( $remote_calls );
	}

	public function test_suggestions_handles_invalid_json_body(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => array(
			'response' => array( 'code' => 200, 'message' => 'OK' ),
			'body'     => 'not-json',
		);

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertFalse( $result->success );
		$this->assertSame( 'Failed to fetch suggestions.', $result->data['message'] );
	}

	// ─── handle_chat_suggestions — XSS Prevention ────────────────────────────────

	public function test_suggestions_strips_html_from_each_suggestion(): void {
		WP_Stubs::$overrides['wp_remote_get'] = fn() => $this->make_response(
			200,
			array(
				'success' => true,
				'data'    => array(
					'suggestions' => array(
						'<script>alert("xss")</script>Revenue question',
						'<img src=x onerror=alert(1)>Products',
					),
				),
			)
		);

		$result = $this->call_handler( 'handle_chat_suggestions' );

		$this->assertTrue( $result->success );
		foreach ( $result->data['suggestions'] as $suggestion ) {
			$this->assertStringNotContainsString( '<', $suggestion );
			$this->assertStringNotContainsString( '>', $suggestion );
		}
	}
}
