import { useCallback, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import PropTypes from 'prop-types';
import useDashboard from '../hooks/useDashboard';
import DashboardGrid from './DashboardGrid';
import ExportPdfButton from './ExportPdfButton';

export default function Dashboard( { onNavigateToChat } ) {
	const {
		charts,
		setCharts,
		loading,
		error,
		deleteChart,
		updateGridLayout,
	} = useDashboard();
	const saveTimerRef = useRef( null );

	useEffect( () => {
		return () => {
			if ( saveTimerRef.current ) {
				clearTimeout( saveTimerRef.current );
			}
		};
	}, [] );

	const handleDelete = useCallback(
		( chartId, title ) => {
			// eslint-disable-next-line no-alert
			if (
				window.confirm(
					__( 'Delete', 'woo-ai-analytics' ) + ' "' + title + '"?'
				)
			) {
				deleteChart( chartId );
			}
		},
		[ deleteChart ]
	);

	const handleLayoutChange = useCallback(
		( updatedCharts ) => {
			setCharts( updatedCharts );

			// Debounce save — wait 500ms after last change
			if ( saveTimerRef.current ) {
				clearTimeout( saveTimerRef.current );
			}
			saveTimerRef.current = setTimeout( () => {
				const items = updatedCharts.map( ( c ) => ( {
					id: c.id,
					gridX: c.gridX || 0,
					gridY: c.gridY || 0,
					gridW: c.gridW || 6,
					gridH: c.gridH || 4,
				} ) );
				updateGridLayout( items );
			}, 500 );
		},
		[ setCharts, updateGridLayout ]
	);

	return (
		<div className="wrap">
			<div className="waa-dashboard">
				<div className="waa-dashboard__header">
					<h1>{ __( 'Dashboard', 'woo-ai-analytics' ) }</h1>
					<div className="waa-dashboard__actions">
						{ ! loading && charts.length > 0 && (
							<ExportPdfButton />
						) }
						{ onNavigateToChat && (
							<button
								type="button"
								className="button button-primary"
								onClick={ onNavigateToChat }
							>
								{ __( 'Ask a Question', 'woo-ai-analytics' ) }
							</button>
						) }
					</div>
				</div>

				{ loading && (
					<div className="waa-dashboard__loading">
						<p>
							{ __(
								'Loading dashboard\u2026',
								'woo-ai-analytics'
							) }
						</p>
					</div>
				) }

				{ error && (
					<div className="notice notice-error">
						<p>{ error }</p>
					</div>
				) }

				{ ! loading && ! error && charts.length === 0 && (
					<div className="waa-dashboard__empty">
						<p>
							{ __(
								'No saved charts yet. Ask a question in the chat and save the chart to your dashboard.',
								'woo-ai-analytics'
							) }
						</p>
					</div>
				) }

				{ ! loading && charts.length > 0 && (
					<DashboardGrid
						charts={ charts }
						onLayoutChange={ handleLayoutChange }
						onDelete={ handleDelete }
					/>
				) }
			</div>
		</div>
	);
}

Dashboard.propTypes = {
	onNavigateToChat: PropTypes.func,
};
