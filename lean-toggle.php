<?php
/**
 * Plugin Name: wp-lean-check toggle
 * Description: Measurement helper, loaded only inside the throwaway Playground. With
 * ?lean=off the plugin under test is deactivated (or the theme swapped for the
 * default one) for that request only, so the same page can be measured with and without it.
 */

if ( ! isset( $_GET['lean'] ) || 'off' !== $_GET['lean'] ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only switch in a disposable test site.
	return;
}

$lean_slug = defined( 'LEAN_SLUG' ) ? LEAN_SLUG : '';
$lean_type = defined( 'LEAN_TYPE' ) ? LEAN_TYPE : 'plugin';

if ( 'theme' === $lean_type ) {
	$lean_theme = static function () {
		return 'twentytwentyfive';
	};
	add_filter( 'pre_option_template', $lean_theme );
	add_filter( 'pre_option_stylesheet', $lean_theme );
	return;
}

add_filter(
	'option_active_plugins',
	static function ( $plugins ) use ( $lean_slug ) {
		return array_values(
			array_filter(
				(array) $plugins,
				static function ( $plugin ) use ( $lean_slug ) {
					return 0 !== strpos( $plugin, $lean_slug . '/' );
				}
			)
		);
	}
);
