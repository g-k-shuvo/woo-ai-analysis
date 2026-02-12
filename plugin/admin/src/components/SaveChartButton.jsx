import { useState, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import PropTypes from 'prop-types';

const { ajaxUrl, nonce } = window.waaData || {};

export default function SaveChartButton( { chartConfig, queryText, chartTitle } ) {
	const [ saving, setSaving ] = useState( false );
	const [ saved, setSaved ] = useState( false );
	const [ error, setError ] = useState( null );

	const handleSave = useCallback( async () => {
		if ( saving || saved ) {
			return;
		}

		setSaving( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_save_chart' );
		formData.append( 'nonce', nonce );
		formData.append( 'title', chartTitle || __( 'Saved Chart', 'woo-ai-analytics' ) );
		formData.append( 'chartConfig', JSON.stringify( chartConfig ) );

		if ( queryText ) {
			formData.append( 'queryText', queryText );
		}

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( result.success ) {
				setSaved( true );
			} else {
				setError(
					result.data?.message ||
						__( 'Failed to save chart.', 'woo-ai-analytics' )
				);
			}
		} catch {
			setError( __( 'Network error. Please try again.', 'woo-ai-analytics' ) );
		} finally {
			setSaving( false );
		}
	}, [ saving, saved, chartConfig, queryText, chartTitle ] );

	if ( saved ) {
		return (
			<span className="waa-save-chart waa-save-chart--saved">
				{ __( 'Saved to Dashboard', 'woo-ai-analytics' ) }
			</span>
		);
	}

	return (
		<span className="waa-save-chart">
			<button
				type="button"
				className="button button-small waa-save-chart__btn"
				onClick={ handleSave }
				disabled={ saving }
			>
				{ saving
					? __( 'Saving…', 'woo-ai-analytics' )
					: __( 'Save to Dashboard', 'woo-ai-analytics' ) }
			</button>
			{ error && (
				<span className="waa-save-chart__error">{ error }</span>
			) }
		</span>
	);
}

SaveChartButton.propTypes = {
	chartConfig: PropTypes.object.isRequired,
	queryText: PropTypes.string,
	chartTitle: PropTypes.string,
};
