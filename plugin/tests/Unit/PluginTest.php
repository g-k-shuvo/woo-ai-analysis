<?php
/**
 * Unit tests for the Plugin class.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics\Tests\Unit;

use PHPUnit\Framework\TestCase;
use WP_Stubs;
use WooAIAnalytics\Plugin;
use WooAIAnalytics\Admin_UI;
use WooAIAnalytics\Settings;
use WooAIAnalytics\Ajax_Handler;
use WooAIAnalytics\Onboarding;
use WooAIAnalytics\Webhooks;
use ReflectionClass;

/**
 * Tests for the core Plugin singleton class.
 */
final class PluginTest extends TestCase {

	protected function setUp(): void {
		parent::setUp();
		WP_Stubs::reset();

		// Reset all singletons before each test.
		$classes = array(
			Plugin::class,
			Admin_UI::class,
			Settings::class,
			Ajax_Handler::class,
			Onboarding::class,
			Webhooks::class,
		);
		foreach ( $classes as $class ) {
			$ref  = new ReflectionClass( $class );
			$prop = $ref->getProperty( 'instance' );
			$prop->setAccessible( true );
			$prop->setValue( null, null );
		}
	}

	protected function tearDown(): void {
		WP_Stubs::reset();
		parent::tearDown();
	}

	// ─── Singleton ───────────────────────────────────────────────────────────────

	public function test_get_instance_returns_plugin_instance(): void {
		$instance = Plugin::get_instance();
		$this->assertInstanceOf( Plugin::class, $instance );
	}

	public function test_singleton_returns_same_instance(): void {
		$a = Plugin::get_instance();
		$b = Plugin::get_instance();
		$this->assertSame( $a, $b );
	}

	// ─── Hook Registration ───────────────────────────────────────────────────────

	public function test_registers_init_action_for_textdomain(): void {
		Plugin::get_instance();

		$action_hooks = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'init', $action_hooks );
	}

	public function test_registers_admin_menu_action(): void {
		Plugin::get_instance();

		$action_hooks = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'admin_menu', $action_hooks );
	}

	public function test_registers_admin_enqueue_scripts_action(): void {
		Plugin::get_instance();

		$action_hooks = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'admin_enqueue_scripts', $action_hooks );
	}

	public function test_registers_woocommerce_hooks_for_webhooks(): void {
		Plugin::get_instance();

		$action_hooks = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'woocommerce_new_order', $action_hooks );
		$this->assertContains( 'woocommerce_update_order', $action_hooks );
		$this->assertContains( 'woocommerce_new_product', $action_hooks );
		$this->assertContains( 'woocommerce_update_product', $action_hooks );
	}

	// ─── Textdomain ──────────────────────────────────────────────────────────────

	public function test_load_textdomain_is_callable(): void {
		$plugin = Plugin::get_instance();
		$this->assertTrue( method_exists( $plugin, 'load_textdomain' ) );
	}

	public function test_load_textdomain_does_not_throw(): void {
		$plugin = Plugin::get_instance();
		$plugin->load_textdomain();
		$this->assertTrue( true ); // Reached without exception.
	}

	// ─── Sub-class Initialization ────────────────────────────────────────────────

	public function test_initializes_settings_singleton(): void {
		Plugin::get_instance();

		// Settings registers AJAX actions — verify those hooks exist.
		$action_hooks = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'wp_ajax_waa_save_settings', $action_hooks );
	}

	public function test_initializes_ajax_handler_singleton(): void {
		Plugin::get_instance();

		$action_hooks = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'wp_ajax_waa_chat_query', $action_hooks );
	}

	public function test_initializes_onboarding_singleton(): void {
		Plugin::get_instance();

		$action_hooks = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'wp_ajax_waa_complete_onboarding', $action_hooks );
	}
}
