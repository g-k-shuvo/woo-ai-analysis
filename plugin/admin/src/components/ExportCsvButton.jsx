import { useState, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const { ajaxUrl, nonce } = window.waaData || {};

export default function ExportCsvButton() {
	const [ exporting, setExporting ] = useState( false );
	const [ error, setError ] = useState( null );

	const handleExport = useCallback( async () => {
		if ( exporting ) {
			return;
		}

		setExporting( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_export_csv' );
		formData.append( 'nonce', nonce );

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( ! result.success || ! result.data?.csvData ) {
				setError(
					result.data?.message ||
						__( 'Failed to export CSV.', 'woo-ai-analytics' )
				);
				return;
			}

			// Convert base64 to blob and trigger download
			const byteCharacters = atob( result.data.csvData );
			const byteNumbers = new Array( byteCharacters.length );
			for ( let i = 0; i < byteCharacters.length; i++ ) {
				byteNumbers[ i ] = byteCharacters.charCodeAt( i );
			}
			const byteArray = new Uint8Array( byteNumbers );
			const blob = new Blob( [ byteArray ], {
				type: 'text/csv;charset=utf-8',
			} );

			const url = URL.createObjectURL( blob );
			const link = document.createElement( 'a' );
			link.href = url;
			link.download =
				result.data.filename || 'dashboard-export.csv';
			document.body.appendChild( link );
			link.click();
			document.body.removeChild( link );
			URL.revokeObjectURL( url );
		} catch {
			setError(
				__( 'Network error. Please try again.', 'woo-ai-analytics' )
			);
		} finally {
			setExporting( false );
		}
	}, [ exporting ] );

	return (
		<span className="waa-export-csv">
			<button
				type="button"
				className="button button-secondary"
				onClick={ handleExport }
				disabled={ exporting }
			>
				{ exporting
					? __( 'Exporting CSV…', 'woo-ai-analytics' )
					: __( 'Export CSV', 'woo-ai-analytics' ) }
			</button>
			{ error && (
				<span className="waa-export-csv__error notice notice-error inline">
					{ error }
				</span>
			) }
		</span>
	);
}
