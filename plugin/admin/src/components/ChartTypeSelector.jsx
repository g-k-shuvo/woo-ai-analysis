import { __ } from '@wordpress/i18n';
import PropTypes from 'prop-types';
import './ChartTypeSelector.css';

const CHART_TYPES = [
	{
		value: 'bar',
		label: __( 'Bar', 'woo-ai-analytics' ),
		icon: '\u2587', // ▇
	},
	{
		value: 'line',
		label: __( 'Line', 'woo-ai-analytics' ),
		icon: '\u2571', // ╱
	},
	{
		value: 'pie',
		label: __( 'Pie', 'woo-ai-analytics' ),
		icon: '\u25D4', // ◔
	},
	{
		value: 'doughnut',
		label: __( 'Doughnut', 'woo-ai-analytics' ),
		icon: '\u25CE', // ◎
	},
	{
		value: 'table',
		label: __( 'Table', 'woo-ai-analytics' ),
		icon: '\u2637', // ☷
	},
];

export default function ChartTypeSelector( { activeType, onTypeChange } ) {
	return (
		<div
			className="waa-chart-type-selector"
			role="toolbar"
			aria-label={ __( 'Chart type', 'woo-ai-analytics' ) }
		>
			{ CHART_TYPES.map( ( chartType ) => (
				<button
					key={ chartType.value }
					type="button"
					className={ `waa-chart-type-selector__btn${
						activeType === chartType.value
							? ' waa-chart-type-selector__btn--active'
							: ''
					}` }
					onClick={ () => onTypeChange( chartType.value ) }
					aria-label={ chartType.label }
					aria-pressed={ activeType === chartType.value }
					title={ chartType.label }
				>
					<span className="waa-chart-type-selector__icon">
						{ chartType.icon }
					</span>
					<span className="waa-chart-type-selector__label">
						{ chartType.label }
					</span>
				</button>
			) ) }
		</div>
	);
}

ChartTypeSelector.propTypes = {
	activeType: PropTypes.oneOf( [ 'bar', 'line', 'pie', 'doughnut', 'table' ] )
		.isRequired,
	onTypeChange: PropTypes.func.isRequired,
};
