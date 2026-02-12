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
 * Stub: add_filter. No-op in tests.
 */
function add_filter( string $hook, mixed $callback, int $priority = 10, int $accepted_args = 1 ): bool {
	WP_Stubs::record( 'add_filter', array( $hook, $callback, $priority ) );
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
 * Stub: absint.
 */
function absint( mixed $maybeint ): int {
	return abs( (int) $maybeint );
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

// ─── WordPress Admin UI Function Stubs ──────────────────────────────────────────

/**
 * Stub: add_menu_page.
 */
function add_menu_page( string $page_title, string $menu_title, string $capability, string $menu_slug, callable|string $callback = '', string $icon_url = '', int|float $position = null ): string {
	WP_Stubs::record( 'add_menu_page', array( $page_title, $menu_title, $capability, $menu_slug, $callback, $icon_url, $position ) );
	return 'toplevel_page_' . $menu_slug;
}

/**
 * Stub: add_submenu_page.
 */
function add_submenu_page( string $parent_slug, string $page_title, string $menu_title, string $capability, string $menu_slug, callable|string $callback = '', int|float $position = null ): string|false {
	WP_Stubs::record( 'add_submenu_page', array( $parent_slug, $page_title, $menu_title, $capability, $menu_slug, $callback, $position ) );
	return $parent_slug . '_page_' . $menu_slug;
}

/**
 * Stub: wp_enqueue_script.
 */
function wp_enqueue_script( string $handle, string $src = '', array $deps = array(), string|bool|null $ver = false, array|bool $in_footer = false ): void {
	WP_Stubs::record( 'wp_enqueue_script', array( $handle, $src, $deps, $ver, $in_footer ) );
}

/**
 * Stub: wp_enqueue_style.
 */
function wp_enqueue_style( string $handle, string $src = '', array $deps = array(), string|bool|null $ver = false, string $media = 'all' ): void {
	WP_Stubs::record( 'wp_enqueue_style', array( $handle, $src, $deps, $ver, $media ) );
}

/**
 * Stub: wp_localize_script.
 */
function wp_localize_script( string $handle, string $object_name, array $l10n ): bool {
	WP_Stubs::record( 'wp_localize_script', array( $handle, $object_name, $l10n ) );
	return true;
}

/**
 * Stub: wp_verify_nonce.
 */
function wp_verify_nonce( string $nonce, string|int $action = -1 ): int|false {
	if ( isset( WP_Stubs::$overrides['wp_verify_nonce'] ) ) {
		return WP_Stubs::$overrides['wp_verify_nonce'];
	}
	return 1;
}

/**
 * Stub: esc_attr.
 */
function esc_attr( string $text ): string {
	return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
}

/**
 * Stub: esc_url.
 */
function esc_url( string $url, ?array $protocols = null, string $context = 'display' ): string {
	return filter_var( $url, FILTER_SANITIZE_URL ) ?: '';
}

// ─── WooCommerce Class Stubs ────────────────────────────────────────────────────

/**
 * Stub: WC_DateTime for date fields.
 */
class WC_DateTime extends \DateTime {
	public function format( string $format ): string {
		return parent::format( $format );
	}
}

/**
 * Stub: WC_Order for webhook tests.
 */
class WC_Order {
	private int $id;
	private string $status;
	private float $total;
	private float $subtotal;
	private float $total_tax;
	private float $shipping_total;
	private float $discount_total;
	private string $currency;
	private int $customer_id;
	private string $payment_method;
	private ?WC_DateTime $date_created;
	private ?WC_DateTime $date_modified;
	/** @var array<string, string> */
	private array $coupon_codes = array();
	/** @var WC_Order_Item_Product[] */
	private array $items = array();

	public function __construct( array $data = array() ) {
		$this->id              = $data['id'] ?? 0;
		$this->status          = $data['status'] ?? 'processing';
		$this->total           = $data['total'] ?? 0.0;
		$this->subtotal        = $data['subtotal'] ?? 0.0;
		$this->total_tax       = $data['total_tax'] ?? 0.0;
		$this->shipping_total  = $data['shipping_total'] ?? 0.0;
		$this->discount_total  = $data['discount_total'] ?? 0.0;
		$this->currency        = $data['currency'] ?? 'USD';
		$this->customer_id     = $data['customer_id'] ?? 0;
		$this->payment_method  = $data['payment_method'] ?? 'stripe';
		$this->date_created    = $data['date_created'] ?? null;
		$this->date_modified   = $data['date_modified'] ?? null;
		$this->coupon_codes    = $data['coupon_codes'] ?? array();
		$this->items           = $data['items'] ?? array();
	}

	public function get_id(): int { return $this->id; }
	public function get_status(): string { return $this->status; }
	public function get_total(): float { return $this->total; }
	public function get_subtotal(): float { return $this->subtotal; }
	public function get_total_tax(): float { return $this->total_tax; }
	public function get_shipping_total(): float { return $this->shipping_total; }
	public function get_discount_total(): float { return $this->discount_total; }
	public function get_currency(): string { return $this->currency; }
	public function get_customer_id(): int { return $this->customer_id; }
	public function get_payment_method(): string { return $this->payment_method; }
	public function get_date_created(): ?WC_DateTime { return $this->date_created; }
	public function get_date_modified(): ?WC_DateTime { return $this->date_modified; }
	public function get_coupon_codes(): array { return $this->coupon_codes; }
	public function get_items(): array { return $this->items; }
}

/**
 * Stub: WC_Order_Item_Product for order item data.
 */
class WC_Order_Item_Product {
	private int $product_id;
	private string $name;
	private int $quantity;
	private float $subtotal;
	private float $total;
	private ?WC_Product $product;

	public function __construct( array $data = array() ) {
		$this->product_id = $data['product_id'] ?? 0;
		$this->name       = $data['name'] ?? '';
		$this->quantity   = $data['quantity'] ?? 1;
		$this->subtotal   = $data['subtotal'] ?? 0.0;
		$this->total      = $data['total'] ?? 0.0;
		$this->product    = $data['product'] ?? null;
	}

	public function get_product_id(): int { return $this->product_id; }
	public function get_name(): string { return $this->name; }
	public function get_quantity(): int { return $this->quantity; }
	public function get_subtotal(): float { return $this->subtotal; }
	public function get_total(): float { return $this->total; }
	public function get_product(): ?WC_Product { return $this->product; }
}

/**
 * Stub: WC_Product for product and order item tests.
 */
class WC_Product {
	private int $id;
	private string $name;
	private string $sku;
	private string $price;
	private string $regular_price;
	private string $sale_price;
	private array $category_ids;
	private ?int $stock_quantity;
	private string $stock_status;
	private string $status;
	private string $type;
	private ?WC_DateTime $date_created;
	private ?WC_DateTime $date_modified;

	public function __construct( array $data = array() ) {
		$this->id             = $data['id'] ?? 0;
		$this->name           = $data['name'] ?? '';
		$this->sku            = $data['sku'] ?? '';
		$this->price          = (string) ( $data['price'] ?? '' );
		$this->regular_price  = (string) ( $data['regular_price'] ?? '' );
		$this->sale_price     = (string) ( $data['sale_price'] ?? '' );
		$this->category_ids   = $data['category_ids'] ?? array();
		$this->stock_quantity = $data['stock_quantity'] ?? null;
		$this->stock_status   = $data['stock_status'] ?? 'instock';
		$this->status         = $data['status'] ?? 'publish';
		$this->type           = $data['type'] ?? 'simple';
		$this->date_created   = $data['date_created'] ?? null;
		$this->date_modified  = $data['date_modified'] ?? null;
	}

	public function get_id(): int { return $this->id; }
	public function get_name(): string { return $this->name; }
	public function get_sku(): string { return $this->sku; }
	public function get_price(): string { return $this->price; }
	public function get_regular_price(): string { return $this->regular_price; }
	public function get_sale_price(): string { return $this->sale_price; }
	public function get_category_ids(): array { return $this->category_ids; }
	public function get_stock_quantity(): ?int { return $this->stock_quantity; }
	public function get_stock_status(): string { return $this->stock_status; }
	public function get_status(): string { return $this->status; }
	public function get_type(): string { return $this->type; }
	public function get_date_created(): ?WC_DateTime { return $this->date_created; }
	public function get_date_modified(): ?WC_DateTime { return $this->date_modified; }
}

/**
 * Stub: WC_Customer for customer webhook tests.
 */
class WC_Customer {
	private int $id;
	private string $email;
	private string $display_name;
	private float $total_spent;
	private int $order_count;
	private ?WC_DateTime $date_created;

	public function __construct( int|array $id_or_data = 0 ) {
		if ( isset( WP_Stubs::$overrides['wc_customer_throws'] ) && WP_Stubs::$overrides['wc_customer_throws'] ) {
			throw new \Exception( 'Invalid customer' );
		}
		if ( is_array( $id_or_data ) ) {
			$data = $id_or_data;
		} else {
			// Look up from stubs registry.
			$data = WP_Stubs::$overrides['wc_customers'][ $id_or_data ] ?? array( 'id' => $id_or_data );
		}
		$this->id           = $data['id'] ?? 0;
		$this->email        = $data['email'] ?? '';
		$this->display_name = $data['display_name'] ?? '';
		$this->total_spent  = $data['total_spent'] ?? 0.0;
		$this->order_count  = $data['order_count'] ?? 0;
		$this->date_created = $data['date_created'] ?? null;
	}

	public function get_id(): int { return $this->id; }
	public function get_email(): string { return $this->email; }
	public function get_display_name(): string { return $this->display_name; }
	public function get_total_spent(): float { return $this->total_spent; }
	public function get_order_count(): int { return $this->order_count; }
	public function get_date_created(): ?WC_DateTime { return $this->date_created; }
}

/**
 * Stub: WP_Term for category webhook tests.
 */
class WP_Term {
	public int $term_id;
	public string $name;
	public int $parent;
	public int $count;
	public string $taxonomy;

	public function __construct( array $data = array() ) {
		$this->term_id  = $data['term_id'] ?? 0;
		$this->name     = $data['name'] ?? '';
		$this->parent   = $data['parent'] ?? 0;
		$this->count    = $data['count'] ?? 0;
		$this->taxonomy = $data['taxonomy'] ?? 'product_cat';
	}
}

/**
 * Stub: get_term.
 */
function get_term( int $term_id, string $taxonomy = '' ): ?WP_Term {
	WP_Stubs::record( 'get_term', array( $term_id, $taxonomy ) );

	if ( isset( WP_Stubs::$overrides['get_term'] ) ) {
		return ( WP_Stubs::$overrides['get_term'] )( $term_id, $taxonomy );
	}

	return null;
}

/**
 * Stub: wc_get_order.
 */
function wc_get_order( int $order_id ): WC_Order|false {
	WP_Stubs::record( 'wc_get_order', array( $order_id ) );

	if ( isset( WP_Stubs::$overrides['wc_get_order'] ) ) {
		return ( WP_Stubs::$overrides['wc_get_order'] )( $order_id );
	}

	return false;
}

/**
 * Stub: wc_get_product.
 */
function wc_get_product( int $product_id ): WC_Product|false {
	WP_Stubs::record( 'wc_get_product', array( $product_id ) );

	if ( isset( WP_Stubs::$overrides['wc_get_product'] ) ) {
		return ( WP_Stubs::$overrides['wc_get_product'] )( $product_id );
	}

	return false;
}

// ─── Load Plugin Classes ────────────────────────────────────────────────────────

require_once WAA_PLUGIN_DIR . 'includes/class-settings.php';
require_once WAA_PLUGIN_DIR . 'includes/class-ajax-handler.php';
require_once WAA_PLUGIN_DIR . 'includes/class-onboarding.php';
require_once WAA_PLUGIN_DIR . 'includes/class-admin-ui.php';
require_once WAA_PLUGIN_DIR . 'includes/class-webhooks.php';
require_once WAA_PLUGIN_DIR . 'includes/class-plugin.php';
