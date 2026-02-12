import { useRef, useEffect } from '@wordpress/element';
import { Chart, registerables } from 'chart.js';
import PropTypes from 'prop-types';
import './ChartRenderer.css';

// Register all Chart.js components (bar, line, pie, doughnut, scales, etc.)
Chart.register( ...registerables );

export default function ChartRenderer( { config } ) {
	const canvasRef = useRef( null );
	const chartRef = useRef( null );

	useEffect( () => {
		if ( ! canvasRef.current || ! config ) {
			return;
		}

		// Destroy previous chart instance if it exists
		if ( chartRef.current ) {
			chartRef.current.destroy();
			chartRef.current = null;
		}

		try {
			chartRef.current = new Chart( canvasRef.current, {
				type: config.type,
				data: config.data,
				options: {
					...config.options,
					responsive: true,
					maintainAspectRatio: true,
				},
			} );
		} catch ( e ) {
			// eslint-disable-next-line no-console
			console.error( 'ChartRenderer: failed to create chart', e );
		}

		return () => {
			if ( chartRef.current ) {
				chartRef.current.destroy();
				chartRef.current = null;
			}
		};
	}, [ config ] );

	if ( ! config ) {
		return null;
	}

	return (
		<div className="waa-chart">
			<canvas ref={ canvasRef } />
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
