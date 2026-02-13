import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

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

	const formatCurrency = ( value ) => {
		return '$' + Number( value ).toLocaleString( undefined, {
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

			<div style={ { marginBottom: '16px' } }>
				<label style={ { marginRight: '8px' } }>
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
				<div style={ { marginBottom: '16px' } }>
					<select
						value={ selectedPreset }
						onChange={ ( e ) =>
							setSelectedPreset( e.target.value )
						}
						style={ { marginRight: '8px' } }
					>
						{ PRESET_OPTIONS.map( ( opt ) => (
							<option key={ opt.value } value={ opt.value }>
								{ opt.label }
							</option>
						) ) }
					</select>
				</div>
			) : (
				<div style={ { marginBottom: '16px' } }>
					<div style={ { marginBottom: '8px' } }>
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
							style={ { marginRight: '4px' } }
						/>
						{ __( 'to', 'woo-ai-analytics' ) }
						<input
							type="date"
							value={ currentEnd }
							onChange={ ( e ) =>
								setCurrentEnd( e.target.value )
							}
							style={ { marginLeft: '4px' } }
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
							style={ { marginRight: '4px' } }
						/>
						{ __( 'to', 'woo-ai-analytics' ) }
						<input
							type="date"
							value={ previousEnd }
							onChange={ ( e ) =>
								setPreviousEnd( e.target.value )
							}
							style={ { marginLeft: '4px' } }
						/>
					</div>
				</div>
			) }

			<button
				type="button"
				className="button button-primary"
				onClick={ handleGenerate }
				disabled={ generating || comparisons.length >= 20 }
				style={ { marginBottom: '16px' } }
			>
				{ generating
					? __( 'Generating…', 'woo-ai-analytics' )
					: __( 'Compare', 'woo-ai-analytics' ) }
			</button>
			{ comparisons.length >= 20 && (
				<span
					className="description"
					style={ { marginLeft: '8px' } }
				>
					{ __(
						'Maximum of 20 comparisons reached. Delete one to create a new one.',
						'woo-ai-analytics'
					) }
				</span>
			) }

			{ activeComparison && (
				<div
					className="card"
					style={ { padding: '16px', marginBottom: '16px' } }
				>
					<h3>
						{ __( 'Comparison Results', 'woo-ai-analytics' ) }
						{ activeComparison.preset && (
							<span style={ { fontWeight: 'normal', marginLeft: '8px' } }>
								({ formatPreset( activeComparison.preset ) })
							</span>
						) }
					</h3>
					<div
						style={ {
							display: 'grid',
							gridTemplateColumns: 'repeat(3, 1fr)',
							gap: '16px',
							marginBottom: '16px',
						} }
					>
						<div className="card" style={ { padding: '12px' } }>
							<strong>
								{ __( 'Revenue', 'woo-ai-analytics' ) }
							</strong>
							<div>
								{ formatCurrency(
									activeComparison.metrics?.current
										?.revenue
								) }
							</div>
							<div style={ { fontSize: '12px', color: '#666' } }>
								{ __(
									'Previous:',
									'woo-ai-analytics'
								) }{ ' ' }
								{ formatCurrency(
									activeComparison.metrics?.previous
										?.revenue
								) }
							</div>
							<div
								style={ {
									color:
										activeComparison.metrics
											?.revenueChange > 0
											? '#00a32a'
											: activeComparison.metrics
													?.revenueChange < 0
											? '#d63638'
											: '#666',
								} }
							>
								{ formatPercent(
									activeComparison.metrics
										?.revenueChangePercent
								) }
							</div>
						</div>
						<div className="card" style={ { padding: '12px' } }>
							<strong>
								{ __( 'Orders', 'woo-ai-analytics' ) }
							</strong>
							<div>
								{ activeComparison.metrics?.current
									?.orderCount ?? 0 }
							</div>
							<div style={ { fontSize: '12px', color: '#666' } }>
								{ __(
									'Previous:',
									'woo-ai-analytics'
								) }{ ' ' }
								{ activeComparison.metrics?.previous
									?.orderCount ?? 0 }
							</div>
							<div
								style={ {
									color:
										activeComparison.metrics
											?.orderCountChange > 0
											? '#00a32a'
											: activeComparison.metrics
													?.orderCountChange < 0
											? '#d63638'
											: '#666',
								} }
							>
								{ formatPercent(
									activeComparison.metrics
										?.orderCountChangePercent
								) }
							</div>
						</div>
						<div className="card" style={ { padding: '12px' } }>
							<strong>
								{ __( 'Avg Order Value', 'woo-ai-analytics' ) }
							</strong>
							<div>
								{ formatCurrency(
									activeComparison.metrics?.current
										?.avgOrderValue
								) }
							</div>
							<div style={ { fontSize: '12px', color: '#666' } }>
								{ __(
									'Previous:',
									'woo-ai-analytics'
								) }{ ' ' }
								{ formatCurrency(
									activeComparison.metrics?.previous
										?.avgOrderValue
								) }
							</div>
							<div
								style={ {
									color:
										activeComparison.metrics?.aovChange >
										0
											? '#00a32a'
											: activeComparison.metrics
													?.aovChange < 0
											? '#d63638'
											: '#666',
								} }
							>
								{ formatPercent(
									activeComparison.metrics
										?.aovChangePercent
								) }
							</div>
						</div>
					</div>
					<div style={ { marginBottom: '8px' } }>
						<strong>{ __( 'Overall Trend:', 'woo-ai-analytics' ) }</strong>{ ' ' }
						{
							TREND_LABELS[
								activeComparison.metrics?.trend
							] || activeComparison.metrics?.trend
						}
					</div>

					{ activeComparison.breakdown?.length > 0 && (
						<details>
							<summary style={ { cursor: 'pointer' } }>
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
										className="button button-small"
										onClick={ () =>
											handleView( comp.id )
										}
										style={ { marginRight: '4px' } }
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
