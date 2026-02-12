import { useRef, useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { Chart, registerables } from 'chart.js';
import PropTypes from 'prop-types';
import './ChartRenderer.css';

// Register all Chart.js components (bar, line, pie, doughnut, scales, etc.)
Chart.register( ...registerables );

const ALLOWED_TYPES = [ 'bar', 'line', 'pie', 'doughnut' ];

export default function ChartRenderer( { config } ) {
	const canvasRef = useRef( null );
	const chartRef = useRef( null );
	const [ error, setError ] = useState( false );

	useEffect( () => {
		if ( ! canvasRef.current || ! config ) {
			return;
		}

		setError( false );

		if ( ! ALLOWED_TYPES.includes( config.type ) ) {
			setError( true );
			return;
		}

		let chart;
		try {
			chart = new Chart( canvasRef.current, {
				type: config.type,
				data: config.data,
				options: {
					...config.options,
					responsive: true,
					maintainAspectRatio: true,
				},
			} );
			chartRef.current = chart;
		} catch ( e ) {
			// eslint-disable-next-line no-console
			console.error( 'ChartRenderer: failed to create chart', e );
			setError( true );
		}

		return () => {
			if ( chart ) {
				chart.destroy();
			}
			chartRef.current = null;
		};
	}, [ config ] );

	if ( ! config ) {
		return null;
	}

	if ( error ) {
		return (
			<div className="waa-chart waa-chart--error">
				{ __( 'Unable to render chart.', 'woo-ai-analytics' ) }
			</div>
		);
	}

	return (
		<div className="waa-chart">
			<canvas
				ref={ canvasRef }
				role="img"
				aria-label={
					config.options?.plugins?.title?.text ||
					__( 'Chart', 'woo-ai-analytics' )
				}
			/>
		</div>
	);
}

ChartRenderer.propTypes = {
	config: PropTypes.shape( {
		type: PropTypes.oneOf( [ 'bar', 'line', 'pie', 'doughnut' ] )
			.isRequired,
		data: PropTypes.object.isRequired,
		options: PropTypes.object,
	} ).isRequired,
};
