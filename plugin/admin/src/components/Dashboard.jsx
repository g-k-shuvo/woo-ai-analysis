import { useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import PropTypes from 'prop-types';
import useDashboard from '../hooks/useDashboard';
import ChartRenderer from './ChartRenderer';
import TableRenderer from './TableRenderer';

export default function Dashboard( { onNavigateToChat } ) {
	const { charts, loading, error, deleteChart } = useDashboard();

	const handleDelete = useCallback(
		( chartId, title ) => {
			// eslint-disable-next-line no-alert
			if ( window.confirm(
				__( 'Delete', 'woo-ai-analytics' ) + ' "' + title + '"?'
			) ) {
				deleteChart( chartId );
			}
		},
		[ deleteChart ]
	);

	return (
		<div className="wrap">
			<div className="waa-dashboard">
				<div className="waa-dashboard__header">
					<h1>{ __( 'Dashboard', 'woo-ai-analytics' ) }</h1>
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

				{ loading && (
					<div className="waa-dashboard__loading">
						<p>{ __( 'Loading dashboard…', 'woo-ai-analytics' ) }</p>
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
					<div className="waa-dashboard__grid">
						{ charts.map( ( chart ) => (
							<div
								key={ chart.id }
								className="waa-dashboard__card"
							>
								<div className="waa-dashboard__card-header">
									<h3 className="waa-dashboard__card-title">
										{ chart.title }
									</h3>
									<button
										type="button"
										className="button button-link-delete waa-dashboard__card-delete"
										onClick={ () =>
											handleDelete(
												chart.id,
												chart.title
											)
										}
									>
										{ __( 'Delete', 'woo-ai-analytics' ) }
									</button>
								</div>
								{ chart.queryText && (
									<p className="waa-dashboard__card-query">
										{ chart.queryText }
									</p>
								) }
								<div className="waa-dashboard__card-chart">
									{ chart.chartConfig &&
										( chart.chartConfig.type === 'table' ? (
											<TableRenderer
												config={ chart.chartConfig }
											/>
										) : (
											<ChartRenderer
												config={ chart.chartConfig }
											/>
										) ) }
								</div>
							</div>
						) ) }
					</div>
				) }
			</div>
		</div>
	);
}

Dashboard.propTypes = {
	onNavigateToChat: PropTypes.func,
};
