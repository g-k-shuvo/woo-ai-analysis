<?php
/**
 * Uninstall handler — cleans up all plugin data.
 *
 * @package WooAIAnalytics
 */

declare(strict_types=1);

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Remove all plugin options.
delete_option( 'waa_api_url' );
delete_option( 'waa_store_api_key' );
delete_option( 'waa_store_id' );
delete_option( 'waa_connected' );
delete_option( 'waa_version' );
delete_option( 'waa_onboarding_completed' );
delete_option( 'waa_onboarding_dismissed' );

// Remove transients.
delete_transient( 'waa_sync_status' );
