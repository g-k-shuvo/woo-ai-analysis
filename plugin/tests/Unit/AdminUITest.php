<?php
/**
 * Unit tests for the Admin_UI class.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

namespace WooAIAnalytics\Tests\Unit;

use PHPUnit\Framework\TestCase;
use WP_Stubs;
use WooAIAnalytics\Admin_UI;
use WooAIAnalytics\Onboarding;
use ReflectionClass;

/**
 * Tests for Admin_UI menu registration and asset enqueuing.
 */
final class AdminUITest extends TestCase {

	private Admin_UI $admin_ui;

	protected function setUp(): void {
		parent::setUp();
		WP_Stubs::reset();

		// Reset singletons.
		foreach ( array( Admin_UI::class, Onboarding::class ) as $class ) {
			$ref  = new ReflectionClass( $class );
			$prop = $ref->getProperty( 'instance' );
			$prop->setAccessible( true );
			$prop->setValue( null, null );
		}

		$this->admin_ui = Admin_UI::get_instance();
	}

	protected function tearDown(): void {
		WP_Stubs::reset();
		$_GET = array();
		parent::tearDown();
	}

	// ─── Singleton ───────────────────────────────────────────────────────────────

	public function test_singleton_returns_same_instance(): void {
		$a = Admin_UI::get_instance();
		$b = Admin_UI::get_instance();
		$this->assertSame( $a, $b );
	}

	// ─── Hook Registration ───────────────────────────────────────────────────────

	public function test_constructor_registers_admin_menu_hook(): void {
		$action_hooks = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'admin_menu', $action_hooks );
	}

	public function test_constructor_registers_admin_enqueue_scripts_hook(): void {
		$action_hooks = array_map(
			fn( $call ) => $call[0],
			WP_Stubs::$calls['add_action'] ?? array(),
		);

		$this->assertContains( 'admin_enqueue_scripts', $action_hooks );
	}

	// ─── register_menu ───────────────────────────────────────────────────────────

	public function test_register_menu_creates_main_menu_page(): void {
		WP_Stubs::$calls = array(); // Clear constructor calls.
		$this->admin_ui->register_menu();

		$menu_calls = WP_Stubs::$calls['add_menu_page'] ?? array();
		$this->assertCount( 1, $menu_calls );
		$this->assertSame( 'AI Analytics', $menu_calls[0][0] ); // page_title
		$this->assertSame( 'AI Analytics', $menu_calls[0][1] ); // menu_title
		$this->assertSame( 'manage_woocommerce', $menu_calls[0][2] ); // capability
		$this->assertSame( 'woo-ai-analytics', $menu_calls[0][3] ); // menu_slug
	}

	public function test_register_menu_uses_chart_area_icon(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->register_menu();

		$menu_calls = WP_Stubs::$calls['add_menu_page'] ?? array();
		$this->assertSame( 'dashicons-chart-area', $menu_calls[0][5] );
	}

	public function test_register_menu_creates_chat_submenu(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->register_menu();

		$submenu_calls = WP_Stubs::$calls['add_submenu_page'] ?? array();
		$this->assertGreaterThanOrEqual( 2, count( $submenu_calls ) );

		// First submenu = Chat.
		$this->assertSame( 'woo-ai-analytics', $submenu_calls[0][0] ); // parent_slug
		$this->assertSame( 'Chat', $submenu_calls[0][1] ); // page_title
		$this->assertSame( 'manage_woocommerce', $submenu_calls[0][3] ); // capability
		$this->assertSame( 'woo-ai-analytics', $submenu_calls[0][4] ); // menu_slug
	}

	public function test_register_menu_creates_settings_submenu(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->register_menu();

		$submenu_calls = WP_Stubs::$calls['add_submenu_page'] ?? array();

		// Second submenu = Settings.
		$this->assertSame( 'Settings', $submenu_calls[1][1] ); // page_title
		$this->assertSame( 'manage_woocommerce', $submenu_calls[1][3] ); // capability
		$this->assertSame( 'woo-ai-analytics-settings', $submenu_calls[1][4] ); // menu_slug
	}

	public function test_all_menu_pages_require_manage_woocommerce(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->register_menu();

		$menu_calls    = WP_Stubs::$calls['add_menu_page'] ?? array();
		$submenu_calls = WP_Stubs::$calls['add_submenu_page'] ?? array();

		foreach ( $menu_calls as $call ) {
			$this->assertSame( 'manage_woocommerce', $call[2] );
		}
		foreach ( $submenu_calls as $call ) {
			$this->assertSame( 'manage_woocommerce', $call[3] );
		}
	}

	// ─── render_page ─────────────────────────────────────────────────────────────

	public function test_render_page_outputs_react_mount_div(): void {
		ob_start();
		$this->admin_ui->render_page();
		$output = ob_get_clean();

		$this->assertSame( '<div id="woo-ai-analytics-root"></div>', $output );
	}

	// ─── enqueue_assets ──────────────────────────────────────────────────────────

	public function test_enqueue_assets_skips_non_plugin_pages(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'edit.php' );

		$this->assertEmpty( WP_Stubs::$calls['wp_enqueue_script'] ?? array() );
	}

	public function test_enqueue_assets_skips_unrelated_page_suffix(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_other-plugin' );

		$this->assertEmpty( WP_Stubs::$calls['wp_enqueue_script'] ?? array() );
	}

	public function test_enqueue_assets_loads_js_on_plugin_page(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$script_calls = WP_Stubs::$calls['wp_enqueue_script'] ?? array();
		$this->assertCount( 1, $script_calls );
		$this->assertSame( 'woo-ai-analytics-admin', $script_calls[0][0] );
		$this->assertStringContainsString( 'admin.js', $script_calls[0][1] );
	}

	public function test_enqueue_assets_loads_on_settings_subpage(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'ai-analytics_page_woo-ai-analytics-settings' );

		$script_calls = WP_Stubs::$calls['wp_enqueue_script'] ?? array();
		$this->assertNotEmpty( $script_calls );
	}

	public function test_enqueue_assets_localizes_script_with_waaData(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$localize_calls = WP_Stubs::$calls['wp_localize_script'] ?? array();
		$this->assertCount( 1, $localize_calls );
		$this->assertSame( 'woo-ai-analytics-admin', $localize_calls[0][0] );
		$this->assertSame( 'waaData', $localize_calls[0][1] );
	}

	public function test_localized_data_contains_ajax_url(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$localize_calls = WP_Stubs::$calls['wp_localize_script'] ?? array();
		$data = $localize_calls[0][2];
		$this->assertArrayHasKey( 'ajaxUrl', $data );
		$this->assertStringContainsString( 'admin-ajax.php', $data['ajaxUrl'] );
	}

	public function test_localized_data_contains_nonce(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$data = ( WP_Stubs::$calls['wp_localize_script'] ?? array() )[0][2];
		$this->assertArrayHasKey( 'nonce', $data );
		$this->assertNotEmpty( $data['nonce'] );
	}

	public function test_localized_data_contains_api_url(): void {
		WP_Stubs::$options['waa_api_url'] = 'https://api.example.com';
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$data = ( WP_Stubs::$calls['wp_localize_script'] ?? array() )[0][2];
		$this->assertSame( 'https://api.example.com', $data['apiUrl'] );
	}

	public function test_localized_data_contains_connected_status(): void {
		WP_Stubs::$options['waa_connected'] = true;
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$data = ( WP_Stubs::$calls['wp_localize_script'] ?? array() )[0][2];
		$this->assertTrue( $data['connected'] );
	}

	public function test_localized_data_connected_defaults_to_false(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$data = ( WP_Stubs::$calls['wp_localize_script'] ?? array() )[0][2];
		$this->assertFalse( $data['connected'] );
	}

	public function test_localized_data_contains_onboarding_complete(): void {
		WP_Stubs::$options['waa_onboarding_completed'] = true;
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$data = ( WP_Stubs::$calls['wp_localize_script'] ?? array() )[0][2];
		$this->assertTrue( $data['onboardingComplete'] );
	}

	public function test_localized_data_onboarding_complete_when_dismissed(): void {
		WP_Stubs::$options['waa_onboarding_dismissed'] = true;
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$data = ( WP_Stubs::$calls['wp_localize_script'] ?? array() )[0][2];
		$this->assertTrue( $data['onboardingComplete'] );
	}

	public function test_localized_data_contains_page_from_get_param(): void {
		$_GET['page'] = 'woo-ai-analytics-settings';
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$data = ( WP_Stubs::$calls['wp_localize_script'] ?? array() )[0][2];
		$this->assertSame( 'woo-ai-analytics-settings', $data['page'] );
	}

	public function test_localized_data_page_defaults_to_empty_string(): void {
		WP_Stubs::$calls = array();
		$this->admin_ui->enqueue_assets( 'toplevel_page_woo-ai-analytics' );

		$data = ( WP_Stubs::$calls['wp_localize_script'] ?? array() )[0][2];
		$this->assertSame( '', $data['page'] );
	}
}
