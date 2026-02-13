import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import './DateRangeComparison.css';

const { ajaxUrl, nonce } = window.waaData || {};

const PRESET_OPTIONS = [
	{ value: 'this_month', label: __( 'This Month vs Last Month', 'woo-ai-analytics' ) },
	{ value: 'this_week', label: __( 'This Week vs Last Week', 'woo-ai-analytics' ) },
	{ value: 'today', label: __( 'Today vs Yesterday', 'woo-ai-analytics' ) },
	{ value: 'this_year', label: __( 'This Year vs Last Year', 'woo-ai-analytics' ) },
	{ value: 'last_7_days', label: __( 'Last 7 Days vs Prior 7 Days', 'woo-ai-analytics' ) },
	{ value: 'last_30_days', label: __( 'Last 30 Days vs Prior 30 Days', 'woo-ai-analytics' ) },
];

const TREND_LABELS = {
	up: __( 'Up', 'woo-ai-analytics' ),
	down: __( 'Down', 'woo-ai-analytics' ),
	flat: __( 'Flat', 'woo-ai-analytics' ),
};

function getChangeClass( value ) {
	if ( value > 0 ) {
		return 'waa-comparison__change--positive';
	}
	if ( value < 0 ) {
		return 'waa-comparison__change--negative';
	}
	return 'waa-comparison__change--neutral';
}

export default function DateRangeComparison() {
	const [ comparisons, setComparisons ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ generating, setGenerating ] = useState( false );
	const [ mode, setMode ] = useState( 'preset' );
	const [ selectedPreset, setSelectedPreset ] = useState( 'this_month' );
	const [ currentStart, setCurrentStart ] = useState( '' );
	const [ currentEnd, setCurrentEnd ] = useState( '' );
	const [ previousStart, setPreviousStart ] = useState( '' );
	const [ previousEnd, setPreviousEnd ] = useState( '' );
	const [ activeComparison, setActiveComparison ] = useState( null );

	const loadComparisons = useCallback( async () => {
		setLoading( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_list_comparisons' );
		formData.append( 'nonce', nonce );

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( result.success && result.data?.comparisons ) {
				setComparisons( result.data.comparisons );
			} else {
				setError(
					result.data?.message ||
						__( 'Failed to load comparisons.', 'woo-ai-analytics' )
				);
			}
		} catch {
			setError(
				__( 'Network error. Please try again.', 'woo-ai-analytics' )
			);
		} finally {
			setLoading( false );
		}
	}, [] );

	useEffect( () => {
		loadComparisons();
	}, [ loadComparisons ] );

	const handleGenerate = useCallback( async () => {
		if ( generating ) {
			return;
		}

		setGenerating( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_generate_comparison' );
		formData.append( 'nonce', nonce );

		if ( mode === 'preset' ) {
			formData.append( 'preset', selectedPreset );
		} else {
			formData.append( 'currentStart', currentStart );
			formData.append( 'currentEnd', currentEnd );
			formData.append( 'previousStart', previousStart );
			formData.append( 'previousEnd', previousEnd );
		}

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( result.success ) {
				setActiveComparison( result.data );
				await loadComparisons();
			} else {
				setError(
					result.data?.message ||
						__( 'Failed to generate comparison.', 'woo-ai-analytics' )
				);
			}
		} catch {
			setError(
				__( 'Network error. Please try again.', 'woo-ai-analytics' )
			);
		} finally {
			setGenerating( false );
		}
	}, [
		generating,
		mode,
		selectedPreset,
		currentStart,
		currentEnd,
		previousStart,
		previousEnd,
		loadComparisons,
	] );

	const handleDelete = useCallback(
		async ( comparisonId ) => {
			if (
				! window.confirm(
					__(
						'Are you sure you want to delete this comparison?',
						'woo-ai-analytics'
					)
				)
			) {
				return;
			}

			const formData = new FormData();
			formData.append( 'action', 'waa_delete_comparison' );
			formData.append( 'nonce', nonce );
			formData.append( 'comparisonId', comparisonId );

			try {
				const response = await fetch( ajaxUrl, {
					method: 'POST',
					body: formData,
				} );

				const result = await response.json();

				if ( result.success ) {
					if ( activeComparison?.id === comparisonId ) {
						setActiveComparison( null );
					}
					await loadComparisons();
				} else {
					setError(
						result.data?.message ||
							__(
								'Failed to delete comparison.',
								'woo-ai-analytics'
							)
					);
				}
			} catch {
				setError(
					__(
						'Network error. Please try again.',
						'woo-ai-analytics'
					)
				);
			}
		},
		[ activeComparison, loadComparisons ]
	);

	const handleView = useCallback( async ( comparisonId ) => {
		const formData = new FormData();
		formData.append( 'action', 'waa_get_comparison' );
		formData.append( 'nonce', nonce );
		formData.append( 'comparisonId', comparisonId );

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( result.success ) {
				setActiveComparison( result.data );
			} else {
				setError(
					result.data?.message ||
						__(
							'Failed to load comparison.',
							'woo-ai-analytics'
						)
				);
			}
		} catch {
			setError(
				__( 'Network error. Please try again.', 'woo-ai-analytics' )
			);
		}
	}, [] );

	const formatCurrency = ( value, currencySymbol = '$' ) => {
		return currencySymbol + Number( value ).toLocaleString( undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		} );
	};

	const formatPercent = ( value ) => {
		const sign = value > 0 ? '+' : '';
		return sign + Number( value ).toFixed( 2 ) + '%';
	};

	const formatPreset = ( preset ) => {
		const found = PRESET_OPTIONS.find( ( o ) => o.value === preset );
		return found ? found.label : preset || __( 'Custom', 'woo-ai-analytics' );
	};

	return (
		<div className="waa-date-range-comparison wrap">
			<h2>
				{ __( 'Date Range Comparison', 'woo-ai-analytics' ) }
			</h2>
			<p className="description">
				{ __(
					'Compare store metrics between two time periods.',
					'woo-ai-analytics'
				) }
			</p>

			{ error && (
				<div className="notice notice-error inline">
					<p>{ error }</p>
				</div>
			) }

			<div className="waa-comparison__mode-selector">
				<label className="waa-comparison__mode-label">
					<input
						type="radio"
						name="comparisonMode"
						value="preset"
						checked={ mode === 'preset' }
						onChange={ () => setMode( 'preset' ) }
					/>
					{ __( 'Preset', 'woo-ai-analytics' ) }
				</label>
				<label>
					<input
						type="radio"
						name="comparisonMode"
						value="custom"
						checked={ mode === 'custom' }
						onChange={ () => setMode( 'custom' ) }
					/>
					{ __( 'Custom Dates', 'woo-ai-analytics' ) }
				</label>
			</div>

			{ mode === 'preset' ? (
				<div className="waa-comparison__preset-row">
					<select
						value={ selectedPreset }
						onChange={ ( e ) =>
							setSelectedPreset( e.target.value )
						}
						className="waa-comparison__preset-select"
					>
						{ PRESET_OPTIONS.map( ( opt ) => (
							<option key={ opt.value } value={ opt.value }>
								{ opt.label }
							</option>
						) ) }
					</select>
				</div>
			) : (
				<div className="waa-comparison__custom-dates">
					<div className="waa-comparison__period-group">
						<strong>
							{ __( 'Current Period:', 'woo-ai-analytics' ) }
						</strong>
						<br />
						<input
							type="date"
							value={ currentStart }
							onChange={ ( e ) =>
								setCurrentStart( e.target.value )
							}
							className="waa-comparison__date-input--start"
						/>
						{ __( 'to', 'woo-ai-analytics' ) }
						<input
							type="date"
							value={ currentEnd }
							onChange={ ( e ) =>
								setCurrentEnd( e.target.value )
							}
							className="waa-comparison__date-input--end"
						/>
					</div>
					<div>
						<strong>
							{ __( 'Previous Period:', 'woo-ai-analytics' ) }
						</strong>
						<br />
						<input
							type="date"
							value={ previousStart }
							onChange={ ( e ) =>
								setPreviousStart( e.target.value )
							}
							className="waa-comparison__date-input--start"
						/>
						{ __( 'to', 'woo-ai-analytics' ) }
						<input
							type="date"
							value={ previousEnd }
							onChange={ ( e ) =>
								setPreviousEnd( e.target.value )
							}
							className="waa-comparison__date-input--end"
						/>
					</div>
				</div>
			) }

			<button
				type="button"
				className="button button-primary waa-comparison__generate-btn"
				onClick={ handleGenerate }
				disabled={ generating || comparisons.length >= 20 }
			>
				{ generating
					? __( 'Generating…', 'woo-ai-analytics' )
					: __( 'Compare', 'woo-ai-analytics' ) }
			</button>
			{ comparisons.length >= 20 && (
				<span className="description waa-comparison__limit-note">
					{ __(
						'Maximum of 20 comparisons reached. Delete one to create a new one.',
						'woo-ai-analytics'
					) }
				</span>
			) }

			{ activeComparison && (
				<div className="card waa-comparison__results-card">
					<h3>
						{ __( 'Comparison Results', 'woo-ai-analytics' ) }
						{ activeComparison.preset && (
							<span className="waa-comparison__results-preset">
								({ formatPreset( activeComparison.preset ) })
							</span>
						) }
					</h3>
					<div className="waa-comparison__metrics-grid">
						<div className="card waa-comparison__metric-card">
							<strong>
								{ __( 'Revenue', 'woo-ai-analytics' ) }
							</strong>
							<div>
								{ formatCurrency(
									activeComparison.metrics?.current
										?.revenue
								) }
							</div>
							<div className="waa-comparison__metric-previous">
								{ __(
									'Previous:',
									'woo-ai-analytics'
								) }{ ' ' }
								{ formatCurrency(
									activeComparison.metrics?.previous
										?.revenue
								) }
							</div>
							<div className={ getChangeClass( activeComparison.metrics?.revenueChange ) }>
								{ formatPercent(
									activeComparison.metrics
										?.revenueChangePercent
								) }
							</div>
						</div>
						<div className="card waa-comparison__metric-card">
							<strong>
								{ __( 'Orders', 'woo-ai-analytics' ) }
							</strong>
							<div>
								{ activeComparison.metrics?.current
									?.orderCount ?? 0 }
							</div>
							<div className="waa-comparison__metric-previous">
								{ __(
									'Previous:',
									'woo-ai-analytics'
								) }{ ' ' }
								{ activeComparison.metrics?.previous
									?.orderCount ?? 0 }
							</div>
							<div className={ getChangeClass( activeComparison.metrics?.orderCountChange ) }>
								{ formatPercent(
									activeComparison.metrics
										?.orderCountChangePercent
								) }
							</div>
						</div>
						<div className="card waa-comparison__metric-card">
							<strong>
								{ __( 'Avg Order Value', 'woo-ai-analytics' ) }
							</strong>
							<div>
								{ formatCurrency(
									activeComparison.metrics?.current
										?.avgOrderValue
								) }
							</div>
							<div className="waa-comparison__metric-previous">
								{ __(
									'Previous:',
									'woo-ai-analytics'
								) }{ ' ' }
								{ formatCurrency(
									activeComparison.metrics?.previous
										?.avgOrderValue
								) }
							</div>
							<div className={ getChangeClass( activeComparison.metrics?.aovChange ) }>
								{ formatPercent(
									activeComparison.metrics
										?.aovChangePercent
								) }
							</div>
						</div>
					</div>
					<div className="waa-comparison__trend-row">
						<strong>{ __( 'Overall Trend:', 'woo-ai-analytics' ) }</strong>{ ' ' }
						{
							TREND_LABELS[
								activeComparison.metrics?.trend
							] || activeComparison.metrics?.trend
						}
					</div>

					{ activeComparison.breakdown?.length > 0 && (
						<details>
							<summary className="waa-comparison__breakdown-toggle">
								{ __(
									'Daily Breakdown',
									'woo-ai-analytics'
								) }
							</summary>
							<table className="wp-list-table widefat fixed striped">
								<thead>
									<tr>
										<th>
											{ __(
												'Date',
												'woo-ai-analytics'
											) }
										</th>
										<th>
											{ __(
												'Current Revenue',
												'woo-ai-analytics'
											) }
										</th>
										<th>
											{ __(
												'Previous Revenue',
												'woo-ai-analytics'
											) }
										</th>
									</tr>
								</thead>
								<tbody>
									{ activeComparison.breakdown.map(
										( row ) => (
											<tr key={ row.date }>
												<td>{ row.date }</td>
												<td>
													{ formatCurrency(
														row.currentRevenue
													) }
												</td>
												<td>
													{ formatCurrency(
														row.previousRevenue
													) }
												</td>
											</tr>
										)
									) }
								</tbody>
							</table>
						</details>
					) }
				</div>
			) }

			<h3>{ __( 'Saved Comparisons', 'woo-ai-analytics' ) }</h3>

			{ loading ? (
				<p>{ __( 'Loading…', 'woo-ai-analytics' ) }</p>
			) : comparisons.length === 0 ? (
				<p className="description">
					{ __(
						'No comparisons yet. Generate one to compare time periods.',
						'woo-ai-analytics'
					) }
				</p>
			) : (
				<table className="wp-list-table widefat fixed striped">
					<thead>
						<tr>
							<th>{ __( 'Period', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Revenue Change', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Order Change', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Trend', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Created', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Actions', 'woo-ai-analytics' ) }</th>
						</tr>
					</thead>
					<tbody>
						{ comparisons.map( ( comp ) => (
							<tr key={ comp.id }>
								<td>
									{ formatPreset( comp.preset ) }
								</td>
								<td>
									{ formatPercent(
										comp.metrics
											?.revenueChangePercent
									) }
								</td>
								<td>
									{ formatPercent(
										comp.metrics
											?.orderCountChangePercent
									) }
								</td>
								<td>
									{
										TREND_LABELS[
											comp.metrics?.trend
										] || comp.metrics?.trend
									}
								</td>
								<td>
									{ comp.createdAt
										? new Date(
												comp.createdAt
										  ).toLocaleString()
										: '' }
								</td>
								<td>
									<button
										type="button"
										className="button button-small waa-comparison__action-btn"
										onClick={ () =>
											handleView( comp.id )
										}
									>
										{ __( 'View', 'woo-ai-analytics' ) }
									</button>
									<button
										type="button"
										className="button button-small button-link-delete"
										onClick={ () =>
											handleDelete( comp.id )
										}
									>
										{ __(
											'Delete',
											'woo-ai-analytics'
										) }
									</button>
								</td>
							</tr>
						) ) }
					</tbody>
				</table>
			) }
		</div>
	);
}
