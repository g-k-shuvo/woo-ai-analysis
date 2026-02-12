import { useState, useCallback, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import PropTypes from 'prop-types';
import ChartRenderer from './ChartRenderer';
import TableRenderer from './TableRenderer';

const GRID_COLUMNS = 12;
const MIN_W = 3;
const MIN_H = 2;
const MAX_W = 12;
const MAX_H = 8;
const COL_PX = 80;
const ROW_PX = 60;

function clamp( value, min, max ) {
	return Math.max( min, Math.min( max, value ) );
}

export default function DashboardGrid( {
	charts,
	onLayoutChange,
	onDelete,
} ) {
	const [ dragId, setDragId ] = useState( null );
	const [ resizeId, setResizeId ] = useState( null );
	const startRef = useRef( null );

	const handleDragStart = useCallback(
		( e, chartId ) => {
			setDragId( chartId );
			startRef.current = {
				mouseX: e.clientX,
				mouseY: e.clientY,
				chart: charts.find( ( c ) => c.id === chartId ),
			};
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData( 'text/plain', chartId );
		},
		[ charts ]
	);

	const handleDragOver = useCallback( ( e ) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	}, [] );

	const handleDrop = useCallback(
		( e ) => {
			e.preventDefault();
			if ( ! dragId || ! startRef.current ) {
				return;
			}

			const deltaX = e.clientX - startRef.current.mouseX;
			const deltaY = e.clientY - startRef.current.mouseY;
			const deltaCols = Math.round( deltaX / COL_PX );
			const deltaRows = Math.round( deltaY / ROW_PX );

			const chart = startRef.current.chart;
			const newX = clamp( chart.gridX + deltaCols, 0, GRID_COLUMNS - chart.gridW );
			const newY = Math.max( 0, chart.gridY + deltaRows );

			const updated = charts.map( ( c ) =>
				c.id === dragId
					? { ...c, gridX: newX, gridY: newY }
					: c
			);

			onLayoutChange( updated );
			setDragId( null );
			startRef.current = null;
		},
		[ dragId, charts, onLayoutChange ]
	);

	const handleDragEnd = useCallback( () => {
		setDragId( null );
		startRef.current = null;
	}, [] );

	const handleResizeStart = useCallback(
		( e, chartId ) => {
			e.stopPropagation();
			e.preventDefault();
			setResizeId( chartId );
			const chart = charts.find( ( c ) => c.id === chartId );
			startRef.current = {
				mouseX: e.clientX,
				mouseY: e.clientY,
				chart,
			};

			const handleResizeMove = ( moveEvent ) => {
				if ( ! startRef.current ) {
					return;
				}
				const dx = moveEvent.clientX - startRef.current.mouseX;
				const dy = moveEvent.clientY - startRef.current.mouseY;
				const dCols = Math.round( dx / COL_PX );
				const dRows = Math.round( dy / ROW_PX );

				const origChart = startRef.current.chart;
				const newW = clamp(
					origChart.gridW + dCols,
					MIN_W,
					Math.min( MAX_W, GRID_COLUMNS - origChart.gridX )
				);
				const newH = clamp( origChart.gridH + dRows, MIN_H, MAX_H );

				const updated = charts.map( ( c ) =>
					c.id === chartId
						? { ...c, gridW: newW, gridH: newH }
						: c
				);
				onLayoutChange( updated );
			};

			const handleResizeEnd = () => {
				setResizeId( null );
				startRef.current = null;
				document.removeEventListener( 'mousemove', handleResizeMove );
				document.removeEventListener( 'mouseup', handleResizeEnd );
			};

			document.addEventListener( 'mousemove', handleResizeMove );
			document.addEventListener( 'mouseup', handleResizeEnd );
		},
		[ charts, onLayoutChange ]
	);

	// Calculate grid container height from max(gridY + gridH) of all charts
	const gridHeight =
		charts.length > 0
			? Math.max( ...charts.map( ( c ) => ( c.gridY || 0 ) + ( c.gridH || 4 ) ) ) *
			  ROW_PX
			: ROW_PX * 4;

	return (
		<div
			className="waa-dashboard-grid"
			onDragOver={ handleDragOver }
			onDrop={ handleDrop }
			style={ {
				position: 'relative',
				width: GRID_COLUMNS * COL_PX + 'px',
				minHeight: gridHeight + 'px',
				maxWidth: '100%',
			} }
		>
			{ charts.map( ( chart ) => {
				const x = ( chart.gridX || 0 ) * COL_PX;
				const y = ( chart.gridY || 0 ) * ROW_PX;
				const w = ( chart.gridW || 6 ) * COL_PX;
				const h = ( chart.gridH || 4 ) * ROW_PX;
				const isDragging = dragId === chart.id;
				const isResizing = resizeId === chart.id;

				return (
					<div
						key={ chart.id }
						className={ `waa-dashboard-grid__item${
							isDragging
								? ' waa-dashboard-grid__item--dragging'
								: ''
						}${ isResizing ? ' waa-dashboard-grid__item--resizing' : '' }` }
						draggable
						onDragStart={ ( e ) =>
							handleDragStart( e, chart.id )
						}
						onDragEnd={ handleDragEnd }
						style={ {
							position: 'absolute',
							left: x + 'px',
							top: y + 'px',
							width: w + 'px',
							height: h + 'px',
							opacity: isDragging ? 0.5 : 1,
							boxSizing: 'border-box',
							padding: '8px',
							border: '1px solid #ddd',
							borderRadius: '4px',
							backgroundColor: '#fff',
							overflow: 'hidden',
							cursor: 'grab',
						} }
					>
						<div className="waa-dashboard-grid__item-header"
							style={ {
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
								marginBottom: '4px',
							} }
						>
							<h3
								style={ {
									margin: 0,
									fontSize: '13px',
									fontWeight: 600,
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
								} }
							>
								{ chart.title }
							</h3>
							{ onDelete && (
								<button
									type="button"
									className="button button-link-delete"
									onClick={ ( e ) => {
										e.stopPropagation();
										onDelete(
											chart.id,
											chart.title
										);
									} }
									style={ {
										fontSize: '11px',
										padding: '0 4px',
									} }
								>
									{ __( 'Delete', 'woo-ai-analytics' ) }
								</button>
							) }
						</div>
						<div
							className="waa-dashboard-grid__item-chart"
							style={ {
								flex: 1,
								overflow: 'hidden',
							} }
						>
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
						{ /* Resize handle */ }
						<div
							className="waa-dashboard-grid__resize-handle"
							onMouseDown={ ( e ) =>
								handleResizeStart( e, chart.id )
							}
							style={ {
								position: 'absolute',
								right: 0,
								bottom: 0,
								width: '16px',
								height: '16px',
								cursor: 'se-resize',
								background:
									'linear-gradient(135deg, transparent 50%, #999 50%)',
								borderRadius: '0 0 4px 0',
							} }
						/>
					</div>
				);
			} ) }
		</div>
	);
}

DashboardGrid.propTypes = {
	charts: PropTypes.arrayOf(
		PropTypes.shape( {
			id: PropTypes.string.isRequired,
			title: PropTypes.string.isRequired,
			chartConfig: PropTypes.object,
			gridX: PropTypes.number,
			gridY: PropTypes.number,
			gridW: PropTypes.number,
			gridH: PropTypes.number,
		} )
	).isRequired,
	onLayoutChange: PropTypes.func.isRequired,
	onDelete: PropTypes.func,
};
