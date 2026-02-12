import { useState, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const { ajaxUrl, nonce } = window.waaData || {};

export default function ExportPdfButton() {
	const [ generating, setGenerating ] = useState( false );
	const [ error, setError ] = useState( null );

	const handleExport = useCallback( async () => {
		if ( generating ) {
			return;
		}

		setGenerating( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_generate_report' );
		formData.append( 'nonce', nonce );
		formData.append(
			'title',
			__( 'Dashboard Report', 'woo-ai-analytics' )
		);

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( ! result.success ) {
				setError(
					result.data?.message ||
						__( 'Failed to generate report.', 'woo-ai-analytics' )
				);
				return;
			}

			// Now download the generated report
			const reportId = result.data?.id;
			if ( ! reportId ) {
				setError(
					__( 'Report generated but ID missing.', 'woo-ai-analytics' )
				);
				return;
			}

			const dlFormData = new FormData();
			dlFormData.append( 'action', 'waa_download_report' );
			dlFormData.append( 'nonce', nonce );
			dlFormData.append( 'reportId', reportId );

			const dlResponse = await fetch( ajaxUrl, {
				method: 'POST',
				body: dlFormData,
			} );

			const dlResult = await dlResponse.json();

			if ( ! dlResult.success || ! dlResult.data?.pdfData ) {
				setError(
					dlResult.data?.message ||
						__(
							'Failed to download report.',
							'woo-ai-analytics'
						)
				);
				return;
			}

			// Convert base64 to blob and trigger download
			const byteCharacters = atob( dlResult.data.pdfData );
			const byteNumbers = new Array( byteCharacters.length );
			for ( let i = 0; i < byteCharacters.length; i++ ) {
				byteNumbers[ i ] = byteCharacters.charCodeAt( i );
			}
			const byteArray = new Uint8Array( byteNumbers );
			const blob = new Blob( [ byteArray ], {
				type: 'application/pdf',
			} );

			const url = URL.createObjectURL( blob );
			const link = document.createElement( 'a' );
			link.href = url;
			link.download =
				dlResult.data.filename || 'dashboard-report.pdf';
			document.body.appendChild( link );
			link.click();
			document.body.removeChild( link );
			URL.revokeObjectURL( url );
		} catch {
			setError(
				__( 'Network error. Please try again.', 'woo-ai-analytics' )
			);
		} finally {
			setGenerating( false );
		}
	}, [ generating ] );

	return (
		<span className="waa-export-pdf">
			<button
				type="button"
				className="button button-secondary"
				onClick={ handleExport }
				disabled={ generating }
			>
				{ generating
					? __( 'Generating PDF…', 'woo-ai-analytics' )
					: __( 'Export PDF', 'woo-ai-analytics' ) }
			</button>
			{ error && (
				<span className="waa-export-pdf__error notice notice-error inline">
					{ error }
				</span>
			) }
		</span>
	);
}
