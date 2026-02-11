<?php
/**
 * PHPUnit bootstrap file.
 *
 * Provides WordPress function stubs so plugin classes can be unit-tested
 * without a full WordPress installation.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

// Define ABSPATH so plugin files load.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', '/tmp/wordpress/' );
}

// Plugin constants.
define( 'WAA_VERSION', '1.0.0' );
define( 'WAA_PLUGIN_FILE', dirname( __DIR__ ) . '/woo-ai-analytics.php' );
define( 'WAA_PLUGIN_DIR', dirname( __DIR__ ) . '/' );
define( 'WAA_PLUGIN_URL', 'https://example.com/wp-content/plugins/woo-ai-analytics/' );
define( 'WAA_PLUGIN_BASENAME', 'woo-ai-analytics/woo-ai-analytics.php' );

// ─── WordPress Function Stubs ──────────────────────────────────────────────────
// These stubs allow the plugin classes to be loaded without a WordPress install.
// Tests override behavior via WP_Stubs helper.

/**
 * Global stubs registry for test-time overrides.
 */
class WP_Stubs {

	/** @var array<string, mixed> */
	public static array $options = array();

	/** @var array<string, callable> */
	public static array $overrides = array();

	/** @var array<string, list<list<mixed>>> */
	public static array $calls = array();

	/**
	 * Record a function call for assertion.
	 */
	public static function record( string $fn, array $args = array() ): void {
		if ( ! isset( self::$calls[ $fn ] ) ) {
			self::$calls[ $fn ] = array();
		}
		self::$calls[ $fn ][] = $args;
	}

	/**
	 * Reset all stubs to defaults.
	 */
	public static function reset(): void {
		self::$options   = array();
		self::$overrides = array();
		self::$calls     = array();
	}
}

/**
 * Stub: get_option.
 */
function get_option( string $key, mixed $default = false ): mixed {
	WP_Stubs::record( 'get_option', array( $key, $default ) );
	if ( array_key_exists( $key, WP_Stubs::$options ) ) {
		return WP_Stubs::$options[ $key ];
	}
	return $default;
}

/**
 * Stub: update_option.
 */
function update_option( string $key, mixed $value, mixed $autoload = null ): bool {
	WP_Stubs::record( 'update_option', array( $key, $value ) );
	WP_Stubs::$options[ $key ] = $value;
	return true;
}

/**
 * Stub: delete_option.
 */
function delete_option( string $key ): bool {
	WP_Stubs::record( 'delete_option', array( $key ) );
	unset( WP_Stubs::$options[ $key ] );
	return true;
}

/**
 * Stub: add_option.
 */
function add_option( string $key, mixed $value = '', string $deprecated = '', mixed $autoload = 'yes' ): bool {
	if ( ! array_key_exists( $key, WP_Stubs::$options ) ) {
		WP_Stubs::$options[ $key ] = $value;
	}
	return true;
}

/**
 * Stub: add_action. No-op in tests.
 */
function add_action( string $hook, mixed $callback, int $priority = 10, int $accepted_args = 1 ): bool {
	WP_Stubs::record( 'add_action', array( $hook, $callback, $priority ) );
	return true;
}

/**
 * Stub: site_url.
 */
function site_url( string $path = '' ): string {
	return 'https://example.com' . $path;
}

/**
 * Stub: admin_url.
 */
function admin_url( string $path = '' ): string {
	return 'https://example.com/wp-admin/' . $path;
}

/**
 * Stub: check_ajax_referer.
 *
 * Returns true by default. Tests can override to throw.
 */
function check_ajax_referer( string $action, string|false $query_arg = false, bool $send_die = true ): int|false {
	WP_Stubs::record( 'check_ajax_referer', array( $action, $query_arg ) );

	if ( isset( WP_Stubs::$overrides['check_ajax_referer'] ) ) {
		return ( WP_Stubs::$overrides['check_ajax_referer'] )( $action, $query_arg, $send_die );
	}

	return 1;
}

/**
 * Stub: current_user_can.
 */
function current_user_can( string $capability, ...$args ): bool {
	WP_Stubs::record( 'current_user_can', array( $capability ) );

	if ( isset( WP_Stubs::$overrides['current_user_can'] ) ) {
		return ( WP_Stubs::$overrides['current_user_can'] )( $capability );
	}

	return true; // Default: user has capability.
}

/**
 * Stub: sanitize_text_field.
 */
function sanitize_text_field( string $str ): string {
	return trim( strip_tags( $str ) );
}

/**
 * Stub: esc_url_raw.
 */
function esc_url_raw( string $url ): string {
	return filter_var( $url, FILTER_SANITIZE_URL ) ?: '';
}

/**
 * Stub: esc_html.
 */
function esc_html( string $text ): string {
	return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
}

/**
 * Stub: esc_html__.
 */
function esc_html__( string $text, string $domain = 'default' ): string {
	return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
}

/**
 * Stub: wp_unslash.
 */
function wp_unslash( string|array $value ): string|array {
	if ( is_array( $value ) ) {
		return array_map( 'wp_unslash', $value );
	}
	return stripslashes( $value );
}

/**
 * Stub: __() — translation.
 */
function __( string $text, string $domain = 'default' ): string {
	return $text;
}

/**
 * Stub: trailingslashit.
 */
function trailingslashit( string $string ): string {
	return rtrim( $string, '/\\' ) . '/';
}

/**
 * Stub: wp_json_encode.
 */
function wp_json_encode( mixed $data, int $options = 0, int $depth = 512 ): string|false {
	return json_encode( $data, $options, $depth );
}

/**
 * Stub: wp_generate_password.
 */
function wp_generate_password( int $length = 12, bool $special_chars = true, bool $extra_special_chars = false ): string {
	$chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
	$password = '';
	for ( $i = 0; $i < $length; $i++ ) {
		$password .= $chars[ random_int( 0, strlen( $chars ) - 1 ) ];
	}
	return $password;
}

/**
 * Stub: wp_salt.
 */
function wp_salt( string $scheme = 'auth' ): string {
	return 'test-salt-' . $scheme;
}

/**
 * Stub WP_Error class.
 */
class WP_Error {

	/** @var array<string, string[]> */
	private array $errors = array();

	public function __construct( string $code = '', string $message = '', mixed $data = '' ) {
		if ( ! empty( $code ) ) {
			$this->errors[ $code ] = array( $message );
		}
	}

	public function get_error_message( string $code = '' ): string {
		if ( empty( $code ) ) {
			$code = array_key_first( $this->errors ) ?? '';
		}
		return $this->errors[ $code ][0] ?? '';
	}

	public function get_error_code(): string {
		return array_key_first( $this->errors ) ?? '';
	}
}

/**
 * Stub: is_wp_error.
 */
function is_wp_error( mixed $thing ): bool {
	return $thing instanceof WP_Error;
}

// wp_remote_post / wp_remote_get / wp_remote_request — overridable via WP_Stubs.

/**
 * Stub: wp_remote_post.
 */
function wp_remote_post( string $url, array $args = array() ): array|WP_Error {
	WP_Stubs::record( 'wp_remote_post', array( $url, $args ) );

	if ( isset( WP_Stubs::$overrides['wp_remote_post'] ) ) {
		return ( WP_Stubs::$overrides['wp_remote_post'] )( $url, $args );
	}

	return array(
		'response' => array( 'code' => 200, 'message' => 'OK' ),
		'body'     => '{"success":true,"data":{}}',
	);
}

/**
 * Stub: wp_remote_get.
 */
function wp_remote_get( string $url, array $args = array() ): array|WP_Error {
	WP_Stubs::record( 'wp_remote_get', array( $url, $args ) );

	if ( isset( WP_Stubs::$overrides['wp_remote_get'] ) ) {
		return ( WP_Stubs::$overrides['wp_remote_get'] )( $url, $args );
	}

	return array(
		'response' => array( 'code' => 200, 'message' => 'OK' ),
		'body'     => '{"success":true,"data":{}}',
	);
}

/**
 * Stub: wp_remote_request.
 */
function wp_remote_request( string $url, array $args = array() ): array|WP_Error {
	WP_Stubs::record( 'wp_remote_request', array( $url, $args ) );

	if ( isset( WP_Stubs::$overrides['wp_remote_request'] ) ) {
		return ( WP_Stubs::$overrides['wp_remote_request'] )( $url, $args );
	}

	return array(
		'response' => array( 'code' => 200, 'message' => 'OK' ),
		'body'     => '{"success":true,"data":{}}',
	);
}

/**
 * Stub: wp_remote_retrieve_response_code.
 */
function wp_remote_retrieve_response_code( array|WP_Error $response ): int|string {
	if ( is_wp_error( $response ) ) {
		return '';
	}
	return $response['response']['code'] ?? 200;
}

/**
 * Stub: wp_remote_retrieve_body.
 */
function wp_remote_retrieve_body( array|WP_Error $response ): string {
	if ( is_wp_error( $response ) ) {
		return '';
	}
	return $response['body'] ?? '';
}

// wp_send_json_success / wp_send_json_error — capture output and throw to stop execution.

/**
 * Exception thrown by wp_send_json stubs to halt handler execution.
 */
class WP_Ajax_Response_Exception extends \RuntimeException {

	public bool $success;
	public mixed $data;
	public int $status_code;

	public function __construct( bool $success, mixed $data, int $status_code = 200 ) {
		$this->success     = $success;
		$this->data        = $data;
		$this->status_code = $status_code;
		parent::__construct( 'wp_send_json called' );
	}
}

/**
 * Stub: wp_send_json_success.
 */
function wp_send_json_success( mixed $data = null, int $status_code = 200 ): never {
	throw new WP_Ajax_Response_Exception( true, $data, $status_code );
}

/**
 * Stub: wp_send_json_error.
 */
function wp_send_json_error( mixed $data = null, int $status_code = 200 ): never {
	throw new WP_Ajax_Response_Exception( false, $data, $status_code );
}

/**
 * Stub: wp_create_nonce.
 */
function wp_create_nonce( string $action = '' ): string {
	return 'test-nonce-' . $action;
}

/**
 * Stub: wp_die. Throws exception to halt execution.
 */
function wp_die( string $message = '', string $title = '', array|int $args = array() ): never {
	throw new \RuntimeException( 'wp_die: ' . $message );
}

/**
 * Stub: plugin_basename.
 */
function plugin_basename( string $file ): string {
	return 'woo-ai-analytics/woo-ai-analytics.php';
}

/**
 * Stub: plugin_dir_path.
 */
function plugin_dir_path( string $file ): string {
	return dirname( $file ) . '/';
}

/**
 * Stub: plugin_dir_url.
 */
function plugin_dir_url( string $file ): string {
	return 'https://example.com/wp-content/plugins/woo-ai-analytics/';
}

/**
 * Stub: deactivate_plugins.
 */
function deactivate_plugins( string|array $plugins ): void {
	WP_Stubs::record( 'deactivate_plugins', array( $plugins ) );
}

/**
 * Stub: apply_filters.
 */
function apply_filters( string $hook_name, mixed $value, ...$args ): mixed {
	return $value;
}

/**
 * Stub: register_activation_hook.
 */
function register_activation_hook( string $file, callable $callback ): void {
	// No-op in tests.
}

/**
 * Stub: register_deactivation_hook.
 */
function register_deactivation_hook( string $file, callable $callback ): void {
	// No-op in tests.
}

/**
 * Stub: delete_transient.
 */
function delete_transient( string $transient ): bool {
	return true;
}

/**
 * Stub: load_plugin_textdomain.
 */
function load_plugin_textdomain( string $domain, string|false $deprecated = false, string|false $plugin_rel_path = false ): bool {
	return true;
}

/**
 * Stub: is_admin.
 */
function is_admin(): bool {
	return true;
}

// ─── Load Plugin Classes ────────────────────────────────────────────────────────

require_once WAA_PLUGIN_DIR . 'includes/class-settings.php';
require_once WAA_PLUGIN_DIR . 'includes/class-ajax-handler.php';
