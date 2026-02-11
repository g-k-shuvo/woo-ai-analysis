<?php
/**
 * Webhooks class — registers WooCommerce hooks for incremental sync.
 *
 * Fires on order/product/customer/category create and update events,
 * transforms the WC entity, and sends it to the SaaS backend.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handles WooCommerce webhook-based incremental sync.
 */
final class Webhooks {

	/**
	 * Singleton instance.
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;

	/**
	 * Get singleton instance.
	 */
	public static function get_instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor — registers WooCommerce action hooks.
	 */
	private function __construct() {
		// Order hooks.
		add_action( 'woocommerce_new_order', array( $this, 'on_order_created' ), 20, 1 );
		add_action( 'woocommerce_update_order', array( $this, 'on_order_updated' ), 20, 1 );

		// Product hooks.
		add_action( 'woocommerce_new_product', array( $this, 'on_product_created' ), 20, 1 );
		add_action( 'woocommerce_update_product', array( $this, 'on_product_updated' ), 20, 1 );

		// Customer hooks.
		add_action( 'woocommerce_created_customer', array( $this, 'on_customer_created' ), 20, 1 );
		add_action( 'woocommerce_update_customer', array( $this, 'on_customer_updated' ), 20, 1 );

		// Category hooks (taxonomy term hooks for product_cat).
		add_action( 'create_product_cat', array( $this, 'on_category_created' ), 20, 1 );
		add_action( 'edited_product_cat', array( $this, 'on_category_updated' ), 20, 1 );
	}

	/**
	 * Check whether the store is connected and ready to sync.
	 *
	 * @return bool True if connected.
	 */
	private function is_connected(): bool {
		return (bool) get_option( 'waa_connected', false )
			&& ! empty( get_option( 'waa_store_api_key', '' ) );
	}

	/**
	 * Send a webhook event to the SaaS backend.
	 *
	 * @param string               $resource Entity type: order, product, customer, category.
	 * @param string               $action   Event action: created or updated.
	 * @param array<string, mixed> $data     Transformed entity data.
	 */
	private function send_webhook( string $resource, string $action, array $data ): void {
		if ( ! $this->is_connected() ) {
			return;
		}

		$api_url    = get_option( 'waa_api_url', '' );
		$auth_token = Settings::get_auth_token();

		if ( empty( $api_url ) || empty( $auth_token ) ) {
			return;
		}

		$payload = wp_json_encode(
			array(
				'resource' => $resource,
				'action'   => $action,
				'data'     => $data,
			)
		);

		if ( false === $payload ) {
			return;
		}

		wp_remote_post(
			trailingslashit( $api_url ) . 'api/sync/webhook',
			array(
				'timeout'   => 5,
				'blocking'  => false,
				'headers'   => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $auth_token,
				),
				'body'      => $payload,
			)
		);
	}

	// -------------------------------------------------------------------------
	// Order hooks
	// -------------------------------------------------------------------------

	/**
	 * Handle new order creation.
	 *
	 * @param int $order_id WooCommerce order ID.
	 */
	public function on_order_created( int $order_id ): void {
		$this->sync_order( $order_id, 'created' );
	}

	/**
	 * Handle order update.
	 *
	 * @param int $order_id WooCommerce order ID.
	 */
	public function on_order_updated( int $order_id ): void {
		$this->sync_order( $order_id, 'updated' );
	}

	/**
	 * Transform and send an order to the backend.
	 *
	 * @param int    $order_id WooCommerce order ID.
	 * @param string $action   created or updated.
	 */
	private function sync_order( int $order_id, string $action ): void {
		try {
			$order = wc_get_order( $order_id );
			if ( ! $order instanceof \WC_Order ) {
				return;
			}

			$data = $this->transform_order( $order );
			$this->send_webhook( 'order', $action, $data );
		} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
			// Silently fail — never break WooCommerce operations.
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( 'WAA webhook error (order): ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}
		}
	}

	/**
	 * Transform a WC_Order into the backend sync payload format.
	 *
	 * @param \WC_Order $order The WooCommerce order.
	 * @return array<string, mixed> Payload matching POST /api/sync/orders schema.
	 */
	private function transform_order( \WC_Order $order ): array {
		$items = array();
		foreach ( $order->get_items() as $item ) {
			/** @var \WC_Order_Item_Product $item */
			$product = $item->get_product();
			$items[] = array(
				'wc_product_id' => $item->get_product_id(),
				'product_name'  => $item->get_name(),
				'sku'           => $product ? $product->get_sku() : '',
				'quantity'      => $item->get_quantity(),
				'subtotal'      => (float) $item->get_subtotal(),
				'total'         => (float) $item->get_total(),
			);
		}

		$coupons = $order->get_coupon_codes();

		return array(
			'wc_order_id'    => $order->get_id(),
			'date_created'   => $order->get_date_created()
				? $order->get_date_created()->format( 'c' )
				: gmdate( 'c' ),
			'date_modified'  => $order->get_date_modified()
				? $order->get_date_modified()->format( 'c' )
				: null,
			'status'         => $order->get_status(),
			'total'          => (float) $order->get_total(),
			'subtotal'       => (float) $order->get_subtotal(),
			'tax_total'      => (float) $order->get_total_tax(),
			'shipping_total' => (float) $order->get_shipping_total(),
			'discount_total' => (float) $order->get_discount_total(),
			'currency'       => $order->get_currency(),
			'customer_id'    => $order->get_customer_id(),
			'payment_method' => $order->get_payment_method(),
			'coupon_used'    => ! empty( $coupons ) ? implode( ',', $coupons ) : '',
			'items'          => $items,
		);
	}

	// -------------------------------------------------------------------------
	// Product hooks
	// -------------------------------------------------------------------------

	/**
	 * Handle new product creation.
	 *
	 * @param int $product_id WooCommerce product ID.
	 */
	public function on_product_created( int $product_id ): void {
		$this->sync_product( $product_id, 'created' );
	}

	/**
	 * Handle product update.
	 *
	 * @param int $product_id WooCommerce product ID.
	 */
	public function on_product_updated( int $product_id ): void {
		$this->sync_product( $product_id, 'updated' );
	}

	/**
	 * Transform and send a product to the backend.
	 *
	 * @param int    $product_id WooCommerce product ID.
	 * @param string $action     created or updated.
	 */
	private function sync_product( int $product_id, string $action ): void {
		try {
			$product = wc_get_product( $product_id );
			if ( ! $product instanceof \WC_Product ) {
				return;
			}

			$data = $this->transform_product( $product );
			$this->send_webhook( 'product', $action, $data );
		} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( 'WAA webhook error (product): ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}
		}
	}

	/**
	 * Transform a WC_Product into the backend sync payload format.
	 *
	 * @param \WC_Product $product The WooCommerce product.
	 * @return array<string, mixed> Payload matching POST /api/sync/products schema.
	 */
	private function transform_product( \WC_Product $product ): array {
		$categories     = $product->get_category_ids();
		$category_id    = ! empty( $categories ) ? (int) $categories[0] : 0;
		$category_name  = '';

		if ( $category_id > 0 ) {
			$term = get_term( $category_id, 'product_cat' );
			if ( $term instanceof \WP_Term ) {
				$category_name = $term->name;
			}
		}

		return array(
			'wc_product_id'  => $product->get_id(),
			'name'           => $product->get_name(),
			'sku'            => $product->get_sku(),
			'price'          => (float) $product->get_price(),
			'regular_price'  => (float) $product->get_regular_price(),
			'sale_price'     => $product->get_sale_price() !== '' ? (float) $product->get_sale_price() : null,
			'category_id'    => $category_id,
			'category_name'  => $category_name,
			'stock_quantity' => $product->get_stock_quantity(),
			'stock_status'   => $product->get_stock_status(),
			'status'         => $product->get_status(),
			'type'           => $product->get_type(),
			'created_at'     => $product->get_date_created()
				? $product->get_date_created()->format( 'c' )
				: null,
			'updated_at'     => $product->get_date_modified()
				? $product->get_date_modified()->format( 'c' )
				: null,
		);
	}

	// -------------------------------------------------------------------------
	// Customer hooks
	// -------------------------------------------------------------------------

	/**
	 * Handle new customer creation.
	 *
	 * @param int $customer_id WooCommerce customer ID.
	 */
	public function on_customer_created( int $customer_id ): void {
		$this->sync_customer( $customer_id, 'created' );
	}

	/**
	 * Handle customer update.
	 *
	 * @param int $customer_id WooCommerce customer ID.
	 */
	public function on_customer_updated( int $customer_id ): void {
		$this->sync_customer( $customer_id, 'updated' );
	}

	/**
	 * Transform and send a customer to the backend.
	 *
	 * @param int    $customer_id WooCommerce customer ID.
	 * @param string $action      created or updated.
	 */
	private function sync_customer( int $customer_id, string $action ): void {
		try {
			$customer = new \WC_Customer( $customer_id );
			if ( ! $customer->get_id() ) {
				return;
			}

			$data = $this->transform_customer( $customer );
			$this->send_webhook( 'customer', $action, $data );
		} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( 'WAA webhook error (customer): ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}
		}
	}

	/**
	 * Transform a WC_Customer into the backend sync payload format.
	 *
	 * Note: Email is sent for server-side hashing. The backend stores only
	 * the SHA256 hash — never the raw email.
	 *
	 * @param \WC_Customer $customer The WooCommerce customer.
	 * @return array<string, mixed> Payload matching POST /api/sync/customers schema.
	 */
	private function transform_customer( \WC_Customer $customer ): array {
		return array(
			'wc_customer_id'  => $customer->get_id(),
			'email'           => $customer->get_email(),
			'display_name'    => $customer->get_display_name(),
			'total_spent'     => (float) $customer->get_total_spent(),
			'order_count'     => $customer->get_order_count(),
			'first_order_date' => null,
			'last_order_date'  => null,
			'created_at'      => $customer->get_date_created()
				? $customer->get_date_created()->format( 'c' )
				: null,
		);
	}

	// -------------------------------------------------------------------------
	// Category hooks
	// -------------------------------------------------------------------------

	/**
	 * Handle new product category creation.
	 *
	 * @param int $term_id The term ID.
	 */
	public function on_category_created( int $term_id ): void {
		$this->sync_category( $term_id, 'created' );
	}

	/**
	 * Handle product category update.
	 *
	 * @param int $term_id The term ID.
	 */
	public function on_category_updated( int $term_id ): void {
		$this->sync_category( $term_id, 'updated' );
	}

	/**
	 * Transform and send a product category to the backend.
	 *
	 * @param int    $term_id Term ID for the product_cat taxonomy.
	 * @param string $action  created or updated.
	 */
	private function sync_category( int $term_id, string $action ): void {
		try {
			$term = get_term( $term_id, 'product_cat' );
			if ( ! $term instanceof \WP_Term ) {
				return;
			}

			$data = $this->transform_category( $term );
			$this->send_webhook( 'category', $action, $data );
		} catch ( \Throwable $e ) { // phpcs:ignore Generic.CodeAnalysis.EmptyStatement.DetectedCatch
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( 'WAA webhook error (category): ' . $e->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}
		}
	}

	/**
	 * Transform a WP_Term (product_cat) into the backend sync payload format.
	 *
	 * @param \WP_Term $term The product category term.
	 * @return array<string, mixed> Payload matching POST /api/sync/categories schema.
	 */
	private function transform_category( \WP_Term $term ): array {
		return array(
			'wc_category_id' => $term->term_id,
			'name'           => $term->name,
			'parent_id'      => $term->parent,
			'product_count'  => $term->count,
		);
	}

	/**
	 * Prevent cloning.
	 */
	private function __clone() {}
}
