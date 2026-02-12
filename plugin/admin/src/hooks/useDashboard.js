import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const { ajaxUrl, nonce } = window.waaData || {};

export default function useDashboard() {
	const [ charts, setCharts ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );

	const fetchCharts = useCallback( async () => {
		if ( ! ajaxUrl || ! nonce ) {
			setLoading( false );
			return;
		}

		setLoading( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_list_charts' );
		formData.append( 'nonce', nonce );

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( result.success && result.data?.charts ) {
				setCharts( result.data.charts );
			} else {
				setError(
					result.data?.message ||
						__( 'Failed to load dashboard.', 'woo-ai-analytics' )
				);
			}
		} catch {
			setError(
				__( 'Network error. Please try again.', 'woo-ai-analytics' )
			);
		} finally {
			setLoading( false );
		}
	}, [] );

	const deleteChart = useCallback(
		async ( chartId ) => {
			const formData = new FormData();
			formData.append( 'action', 'waa_delete_chart' );
			formData.append( 'nonce', nonce );
			formData.append( 'chartId', chartId );

			try {
				const response = await fetch( ajaxUrl, {
					method: 'POST',
					body: formData,
				} );

				const result = await response.json();

				if ( result.success ) {
					setCharts( ( prev ) =>
						prev.filter( ( c ) => c.id !== chartId )
					);
				} else {
					setError(
						result.data?.message ||
							__(
								'Failed to delete chart.',
								'woo-ai-analytics'
							)
					);
				}
			} catch {
				setError(
					__(
						'Network error. Please try again.',
						'woo-ai-analytics'
					)
				);
			}
		},
		[]
	);

	const updateGridLayout = useCallback(
		async ( items ) => {
			if ( ! ajaxUrl || ! nonce || ! items || items.length === 0 ) {
				return;
			}

			const formData = new FormData();
			formData.append( 'action', 'waa_update_grid_layout' );
			formData.append( 'nonce', nonce );
			formData.append( 'items', JSON.stringify( items ) );

			try {
				const response = await fetch( ajaxUrl, {
					method: 'POST',
					body: formData,
				} );

				const result = await response.json();

				if ( ! result.success ) {
					setError(
						result.data?.message ||
							__(
								'Failed to update layout.',
								'woo-ai-analytics'
							)
					);
				}
			} catch {
				setError(
					__(
						'Network error. Please try again.',
						'woo-ai-analytics'
					)
				);
			}
		},
		[]
	);

	useEffect( () => {
		fetchCharts();
	}, [ fetchCharts ] );

	return {
		charts,
		setCharts,
		loading,
		error,
		deleteChart,
		updateGridLayout,
		refresh: fetchCharts,
	};
}
