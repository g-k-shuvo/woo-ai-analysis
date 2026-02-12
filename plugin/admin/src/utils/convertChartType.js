/**
 * Client-side chart type converter.
 *
 * Converts between chart types using the existing chart config, rows,
 * and metadata from the backend response. Mirrors the backend logic
 * in backend/src/ai/chartTypeConverter.ts.
 *
 * This is a pure function — no I/O, no side effects.
 */

const COLOR_PALETTE = [
	'rgba(54, 162, 235, 0.7)',
	'rgba(255, 99, 132, 0.7)',
	'rgba(75, 192, 192, 0.7)',
	'rgba(255, 159, 64, 0.7)',
	'rgba(153, 102, 255, 0.7)',
	'rgba(255, 205, 86, 0.7)',
	'rgba(201, 203, 207, 0.7)',
	'rgba(46, 204, 113, 0.7)',
	'rgba(231, 76, 60, 0.7)',
	'rgba(52, 73, 94, 0.7)',
	'rgba(26, 188, 156, 0.7)',
	'rgba(241, 196, 15, 0.7)',
];

const BORDER_PALETTE = COLOR_PALETTE.map( ( c ) => c.replace( '0.7)', '1)' ) );

function generateColors( count ) {
	return Array.from(
		{ length: count },
		( _, i ) => COLOR_PALETTE[ i % COLOR_PALETTE.length ]
	);
}

function generateBorderColors( count ) {
	return Array.from(
		{ length: count },
		( _, i ) => BORDER_PALETTE[ i % BORDER_PALETTE.length ]
	);
}

function toNumber( value ) {
	if ( value === null || value === undefined ) {
		return 0;
	}
	const num = Number( value );
	return Number.isFinite( num ) ? num : 0;
}

function toLabel( value ) {
	if ( value === null || value === undefined ) {
		return '';
	}
	return String( value );
}

function buildPieConfig( type, labels, data, count, title ) {
	return {
		type,
		data: {
			labels,
			datasets: [
				{
					label: title,
					data,
					backgroundColor: generateColors( count ),
					borderColor: generateBorderColors( count ),
					borderWidth: 1,
				},
			],
		},
		options: {
			responsive: true,
			plugins: {
				title: { display: true, text: title },
				legend: { display: true, position: 'right' },
			},
		},
	};
}

function buildAxisConfig( type, labels, data, count, meta ) {
	return {
		type,
		data: {
			labels,
			datasets: [
				{
					label: meta.title,
					data,
					backgroundColor: generateColors( count ),
					borderColor: generateBorderColors( count ),
					borderWidth: 1,
				},
			],
		},
		options: {
			responsive: true,
			plugins: {
				title: { display: true, text: meta.title },
			},
			scales: {
				x: {
					title: {
						display: true,
						text: meta.xLabel || meta.labelKey,
					},
				},
				y: {
					title: {
						display: true,
						text: meta.yLabel || meta.dataKey,
					},
				},
			},
		},
	};
}

function buildTableFromRows( rows, title ) {
	if ( ! rows || rows.length === 0 ) {
		return { type: 'table', title, headers: [], rows: [] };
	}

	const headers = Object.keys( rows[ 0 ] );
	const tableRows = rows.map( ( row ) => headers.map( ( h ) => row[ h ] ) );

	return { type: 'table', title, headers, rows: tableRows };
}

function buildChartFromRows( rows, targetType, meta ) {
	const labels = rows.map( ( row ) => toLabel( row[ meta.labelKey ] ) );
	const data = rows.map( ( row ) => toNumber( row[ meta.dataKey ] ) );
	const count = data.length;

	if ( targetType === 'pie' || targetType === 'doughnut' ) {
		return buildPieConfig( targetType, labels, data, count, meta.title );
	}

	return buildAxisConfig( targetType, labels, data, count, meta );
}

/**
 * Convert an existing chart config to a different chart type.
 *
 * @param {Object} currentConfig - The current ChartConfiguration or TableResult
 * @param {Array}  rows          - The original query result rows
 * @param {string} targetType    - Target chart type (bar, line, pie, doughnut, table)
 * @param {Object} meta          - { title, dataKey, labelKey, xLabel?, yLabel? }
 * @return {Object} A new chart config for the target type
 */
export default function convertChartType(
	currentConfig,
	rows,
	targetType,
	meta
) {
	if ( ! currentConfig ) {
		return currentConfig;
	}

	// Same type → return as-is
	if ( currentConfig.type === targetType ) {
		return currentConfig;
	}

	// Target is table → build from rows
	if ( targetType === 'table' ) {
		return buildTableFromRows( rows, meta.title );
	}

	// Source is table → build chart from rows + meta
	if ( currentConfig.type === 'table' ) {
		return buildChartFromRows( rows, targetType, meta );
	}

	// Chart → chart: reuse labels and data
	const labels = currentConfig.data.labels;
	const data = currentConfig.data.datasets[ 0 ].data;
	const count = data.length;

	if ( targetType === 'pie' || targetType === 'doughnut' ) {
		return buildPieConfig( targetType, labels, data, count, meta.title );
	}

	// bar or line — preserve axis labels from source if available
	const xText = currentConfig.options?.scales?.x?.title?.text;
	const yText = currentConfig.options?.scales?.y?.title?.text;

	return buildAxisConfig( targetType, labels, data, count, {
		...meta,
		xLabel: xText || meta.xLabel,
		yLabel: yText || meta.yLabel,
	} );
}
