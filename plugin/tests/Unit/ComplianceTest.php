<?php
/**
 * Unit tests for WordPress.org compliance features.
 *
 * Covers: index.php silence files, uninstall.php completeness,
 * readme.txt format, plugin action links, singleton __wakeup(),
 * POT translation file, and ABSPATH guards.
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
 * Tests for WordPress.org compliance requirements.
 */
final class ComplianceTest extends TestCase {

	/**
	 * Plugin root directory.
	 */
	private string $plugin_dir;

	protected function setUp(): void {
		parent::setUp();
		WP_Stubs::reset();
		$this->plugin_dir = dirname( __DIR__, 2 ) . '/';

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

	// ─── Index.php Silence Files ────────────────────────────────────────────────

	/**
	 * @dataProvider indexPhpDirectoriesProvider
	 */
	public function test_index_php_exists_in_directory( string $relative_path ): void {
		$file = $this->plugin_dir . $relative_path . '/index.php';
		$this->assertFileExists( $file, "Missing index.php in {$relative_path}/" );
	}

	/**
	 * @dataProvider indexPhpDirectoriesProvider
	 */
	public function test_index_php_contains_silence_comment( string $relative_path ): void {
		$file    = $this->plugin_dir . $relative_path . '/index.php';
		$content = file_get_contents( $file );
		$this->assertStringContainsString( '<?php', $content );
		$this->assertStringContainsString( 'Silence is golden', $content );
	}

	/**
	 * Directories that must have index.php for directory listing prevention.
	 */
	public static function indexPhpDirectoriesProvider(): array {
		return array(
			'plugin root' => array( '' ),
			'includes'    => array( 'includes' ),
			'assets'      => array( 'assets' ),
			'assets/js'   => array( 'assets/js' ),
			'languages'   => array( 'languages' ),
		);
	}

	// ─── Uninstall.php ──────────────────────────────────────────────────────────

	public function test_uninstall_php_exists(): void {
		$this->assertFileExists( $this->plugin_dir . 'uninstall.php' );
	}

	public function test_uninstall_php_has_guard(): void {
		$content = file_get_contents( $this->plugin_dir . 'uninstall.php' );
		$this->assertStringContainsString( 'WP_UNINSTALL_PLUGIN', $content );
	}

	public function test_uninstall_php_deletes_all_plugin_options(): void {
		$content         = file_get_contents( $this->plugin_dir . 'uninstall.php' );
		$expected_options = array(
			'waa_api_url',
			'waa_store_api_key',
			'waa_store_id',
			'waa_connected',
			'waa_version',
			'waa_onboarding_completed',
			'waa_onboarding_dismissed',
		);
		foreach ( $expected_options as $option ) {
			$this->assertStringContainsString(
				"delete_option( '{$option}' )",
				$content,
				"uninstall.php must delete option: {$option}"
			);
		}
	}

	public function test_uninstall_php_deletes_transients(): void {
		$content = file_get_contents( $this->plugin_dir . 'uninstall.php' );
		$this->assertStringContainsString( "delete_transient( 'waa_sync_status' )", $content );
	}

	// ─── Readme.txt ─────────────────────────────────────────────────────────────

	public function test_readme_txt_exists(): void {
		$this->assertFileExists( $this->plugin_dir . 'readme.txt' );
	}

	public function test_readme_txt_has_required_header_fields(): void {
		$content = file_get_contents( $this->plugin_dir . 'readme.txt' );
		$this->assertStringContainsString( 'Contributors:', $content );
		$this->assertStringContainsString( 'Tags:', $content );
		$this->assertStringContainsString( 'Requires at least:', $content );
		$this->assertStringContainsString( 'Tested up to:', $content );
		$this->assertStringContainsString( 'Requires PHP:', $content );
		$this->assertStringContainsString( 'Stable tag:', $content );
		$this->assertStringContainsString( 'License:', $content );
	}

	public function test_readme_txt_has_required_sections(): void {
		$content = file_get_contents( $this->plugin_dir . 'readme.txt' );
		$this->assertStringContainsString( '== Description ==', $content );
		$this->assertStringContainsString( '== Installation ==', $content );
		$this->assertStringContainsString( '== Frequently Asked Questions ==', $content );
		$this->assertStringContainsString( '== Screenshots ==', $content );
		$this->assertStringContainsString( '== Changelog ==', $content );
		$this->assertStringContainsString( '== Upgrade Notice ==', $content );
	}

	public function test_readme_txt_has_third_party_services_disclosure(): void {
		$content = file_get_contents( $this->plugin_dir . 'readme.txt' );
		$this->assertStringContainsString( 'Third-Party Services', $content );
		$this->assertStringContainsString( 'OpenAI', $content );
		$this->assertStringContainsString( 'Privacy Policy', $content );
	}

	// ─── POT File ───────────────────────────────────────────────────────────────

	public function test_pot_file_exists(): void {
		$this->assertFileExists( $this->plugin_dir . 'languages/woo-ai-analytics.pot' );
	}

	public function test_pot_file_has_correct_domain(): void {
		$content = file_get_contents( $this->plugin_dir . 'languages/woo-ai-analytics.pot' );
		$this->assertStringContainsString( 'X-Domain: woo-ai-analytics', $content );
	}

	public function test_pot_file_contains_key_strings(): void {
		$content = file_get_contents( $this->plugin_dir . 'languages/woo-ai-analytics.pot' );
		$this->assertStringContainsString( 'Permission denied.', $content );
		$this->assertStringContainsString( 'Settings', $content );
		$this->assertStringContainsString( 'AI Analytics', $content );
		$this->assertStringContainsString( 'Store is not connected.', $content );
	}

	// ─── Plugin Header ──────────────────────────────────────────────────────────

	public function test_main_plugin_file_has_required_headers(): void {
		$content = file_get_contents( $this->plugin_dir . 'woo-ai-analytics.php' );
		$this->assertStringContainsString( 'Plugin Name:', $content );
		$this->assertStringContainsString( 'Version:', $content );
		$this->assertStringContainsString( 'Requires at least:', $content );
		$this->assertStringContainsString( 'Requires PHP:', $content );
		$this->assertStringContainsString( 'License:', $content );
		$this->assertStringContainsString( 'Text Domain:', $content );
		$this->assertStringContainsString( 'Domain Path:', $content );
	}

	public function test_main_plugin_file_has_wc_headers(): void {
		$content = file_get_contents( $this->plugin_dir . 'woo-ai-analytics.php' );
		$this->assertStringContainsString( 'WC requires at least:', $content );
		$this->assertStringContainsString( 'WC tested up to:', $content );
	}

	// ─── ABSPATH Guards ─────────────────────────────────────────────────────────

	/**
	 * @dataProvider phpSourceFilesProvider
	 */
	public function test_php_file_has_abspath_guard( string $relative_path ): void {
		$content = file_get_contents( $this->plugin_dir . $relative_path );
		$this->assertStringContainsString( "defined( 'ABSPATH' )", $content );
	}

	public static function phpSourceFilesProvider(): array {
		return array(
			'main file'     => array( 'woo-ai-analytics.php' ),
			'class-plugin'  => array( 'includes/class-plugin.php' ),
			'class-admin-ui' => array( 'includes/class-admin-ui.php' ),
			'class-ajax'    => array( 'includes/class-ajax-handler.php' ),
			'class-settings' => array( 'includes/class-settings.php' ),
			'class-onboard' => array( 'includes/class-onboarding.php' ),
			'class-webhook' => array( 'includes/class-webhooks.php' ),
		);
	}

	// ─── HPOS Compatibility ─────────────────────────────────────────────────────

	public function test_main_file_declares_hpos_compatibility(): void {
		$content = file_get_contents( $this->plugin_dir . 'woo-ai-analytics.php' );
		$this->assertStringContainsString( 'before_woocommerce_init', $content );
		$this->assertStringContainsString( 'custom_order_tables', $content );
		$this->assertStringContainsString( 'FeaturesUtil', $content );
	}

	// ─── Plugin Action Links ────────────────────────────────────────────────────

	public function test_main_file_registers_plugin_action_links_filter(): void {
		$content = file_get_contents( $this->plugin_dir . 'woo-ai-analytics.php' );
		$this->assertStringContainsString( 'plugin_action_links_', $content );
	}

	public function test_plugin_action_links_contains_settings_url(): void {
		$content = file_get_contents( $this->plugin_dir . 'woo-ai-analytics.php' );
		$this->assertStringContainsString( 'admin.php?page=woo-ai-analytics-settings', $content );
	}

	// ─── Singleton __wakeup() ───────────────────────────────────────────────────

	/**
	 * @dataProvider singletonClassesProvider
	 */
	public function test_singleton_wakeup_throws_runtime_exception( string $class ): void {
		$ref      = new ReflectionClass( $class );
		$instance = $ref->newInstanceWithoutConstructor();

		$this->expectException( \RuntimeException::class );
		$this->expectExceptionMessage( 'Cannot unserialize singleton.' );
		$instance->__wakeup();
	}

	/**
	 * @dataProvider singletonClassesProvider
	 */
	public function test_singleton_has_public_wakeup_method( string $class ): void {
		$ref    = new ReflectionClass( $class );
		$method = $ref->getMethod( '__wakeup' );
		$this->assertTrue( $method->isPublic(), "{$class}::__wakeup() must be public" );
	}

	public static function singletonClassesProvider(): array {
		return array(
			'Plugin'       => array( Plugin::class ),
			'Admin_UI'     => array( Admin_UI::class ),
			'Settings'     => array( Settings::class ),
			'Ajax_Handler' => array( Ajax_Handler::class ),
			'Onboarding'   => array( Onboarding::class ),
			'Webhooks'     => array( Webhooks::class ),
		);
	}

	// ─── WooCommerce Dependency Check ───────────────────────────────────────────

	public function test_main_file_checks_woocommerce_active(): void {
		$content = file_get_contents( $this->plugin_dir . 'woo-ai-analytics.php' );
		$this->assertStringContainsString( 'waa_is_woocommerce_active', $content );
	}

	public function test_main_file_shows_admin_notice_when_wc_inactive(): void {
		$content = file_get_contents( $this->plugin_dir . 'woo-ai-analytics.php' );
		$this->assertStringContainsString( 'admin_notices', $content );
		$this->assertStringContainsString( 'requires WooCommerce', $content );
	}

	// ─── Textdomain ─────────────────────────────────────────────────────────────

	public function test_plugin_loads_textdomain(): void {
		$content = file_get_contents( $this->plugin_dir . 'includes/class-plugin.php' );
		$this->assertStringContainsString( 'load_plugin_textdomain', $content );
		$this->assertStringContainsString( "'woo-ai-analytics'", $content );
	}

	// ─── Strict Types ───────────────────────────────────────────────────────────

	/**
	 * @dataProvider phpSourceFilesProvider
	 */
	public function test_php_file_declares_strict_types( string $relative_path ): void {
		$content = file_get_contents( $this->plugin_dir . $relative_path );
		$this->assertStringContainsString( 'declare(strict_types=1)', $content );
	}

	// ─── Clean Uninstall Guard ──────────────────────────────────────────────────

	public function test_uninstall_has_strict_types(): void {
		$content = file_get_contents( $this->plugin_dir . 'uninstall.php' );
		$this->assertStringContainsString( 'declare(strict_types=1)', $content );
	}
}
