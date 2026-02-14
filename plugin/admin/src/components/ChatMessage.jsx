import { useState, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import PropTypes from 'prop-types';
import ChartRenderer from './ChartRenderer';
import TableRenderer from './TableRenderer';
import ChartTypeSelector from './ChartTypeSelector';
import SaveChartButton from './SaveChartButton';
import convertChartType from '../utils/convertChartType';

export default function ChatMessage( { msg, formatTime, onRetry, loading } ) {
	const hasChart = msg.role === 'assistant' && msg.data?.chartConfig;
	const hasMeta = msg.data?.chartMeta;
	const [ activeConfig, setActiveConfig ] = useState(
		msg.data?.chartConfig || null
	);
	const activeType = activeConfig?.type || null;

	const handleTypeChange = useCallback(
		( newType ) => {
			if ( ! msg.data?.chartConfig || ! msg.data?.chartMeta ) {
				return;
			}

			const meta = {
				title: msg.data.chartSpec?.title || '',
				...msg.data.chartMeta,
			};

			const newConfig = convertChartType(
				activeConfig,
				msg.data.rows || [],
				newType,
				meta
			);

			setActiveConfig( newConfig );
		},
		[ activeConfig, msg.data ]
	);

	const handleRetry = useCallback( () => {
		if ( msg.failedQuestion && onRetry ) {
			onRetry( msg.failedQuestion );
		}
	}, [ msg.failedQuestion, onRetry ] );

	return (
		<div
			className={ `waa-chat__message waa-chat__message--${ msg.role }${
				hasChart ? ' waa-chat__message--has-visual' : ''
			}` }
		>
			<div className="waa-chat__message-content">{ msg.content }</div>
			{ msg.role === 'error' && msg.failedQuestion && onRetry && (
				<button
					type="button"
					className="button button-small waa-chat__retry-btn"
					onClick={ handleRetry }
					disabled={ loading }
				>
					{ __( 'Retry', 'woo-ai-analytics' ) }
				</button>
			) }
			{ hasChart && hasMeta && activeType && (
				<ChartTypeSelector
					activeType={ activeType }
					onTypeChange={ handleTypeChange }
				/>
			) }
			{ hasChart &&
				activeConfig &&
				( activeConfig.type === 'table' ? (
					<TableRenderer config={ activeConfig } />
				) : (
					<ChartRenderer config={ activeConfig } />
				) ) }
			{ ! hasChart &&
				msg.role === 'assistant' &&
				msg.data?.rows?.length > 0 && (
				<TableRenderer
					config={ {
						type: 'table',
						headers: Object.keys( msg.data.rows[ 0 ] ),
						rows: msg.data.rows.map( ( row ) =>
							Object.values( row )
						),
					} }
				/>
			) }
			{ hasChart && activeConfig && (
				<SaveChartButton
					chartConfig={ activeConfig }
					queryText={ msg.data?.sql || msg.content }
					chartTitle={ msg.data?.chartSpec?.title || msg.content.slice( 0, 100 ) }
				/>
			) }
			{ msg.data?.rowCount !== undefined && msg.role === 'assistant' && (
				<div className="waa-chat__message-meta">
					{ msg.data.rowCount }{ ' ' }
					{ msg.data.rowCount === 1
						? __( 'row', 'woo-ai-analytics' )
						: __( 'rows', 'woo-ai-analytics' ) }
					{ ' · ' }
					{ msg.data.durationMs }
					{ __( 'ms', 'woo-ai-analytics' ) }
				</div>
			) }
			<div className="waa-chat__message-time">
				{ formatTime( msg.timestamp ) }
			</div>
		</div>
	);
}

ChatMessage.propTypes = {
	msg: PropTypes.shape( {
		id: PropTypes.string.isRequired,
		role: PropTypes.string.isRequired,
		content: PropTypes.string.isRequired,
		timestamp: PropTypes.number.isRequired,
		data: PropTypes.object,
		failedQuestion: PropTypes.string,
	} ).isRequired,
	formatTime: PropTypes.func.isRequired,
	onRetry: PropTypes.func,
	loading: PropTypes.bool,
};
