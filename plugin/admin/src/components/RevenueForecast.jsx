import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const { ajaxUrl, nonce } = window.waaData || {};

const DAYS_OPTIONS = [
	{ value: 7, label: __( '7 days', 'woo-ai-analytics' ) },
	{ value: 14, label: __( '14 days', 'woo-ai-analytics' ) },
	{ value: 30, label: __( '30 days', 'woo-ai-analytics' ) },
];

const TREND_LABELS = {
	up: __( 'Trending Up', 'woo-ai-analytics' ),
	down: __( 'Trending Down', 'woo-ai-analytics' ),
	flat: __( 'Flat', 'woo-ai-analytics' ),
};

export default function RevenueForecast() {
	const [ forecasts, setForecasts ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ generating, setGenerating ] = useState( false );
	const [ selectedDays, setSelectedDays ] = useState( 30 );
	const [ activeForecast, setActiveForecast ] = useState( null );

	const loadForecasts = useCallback( async () => {
		setLoading( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_list_forecasts' );
		formData.append( 'nonce', nonce );

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( result.success && result.data?.forecasts ) {
				setForecasts( result.data.forecasts );
			} else {
				setError(
					result.data?.message ||
						__( 'Failed to load forecasts.', 'woo-ai-analytics' )
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
		loadForecasts();
	}, [ loadForecasts ] );

	const handleGenerate = useCallback( async () => {
		if ( generating ) {
			return;
		}

		setGenerating( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_generate_forecast' );
		formData.append( 'nonce', nonce );
		formData.append( 'daysAhead', String( selectedDays ) );

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( result.success ) {
				setActiveForecast( result.data );
				await loadForecasts();
			} else {
				setError(
					result.data?.message ||
						__( 'Failed to generate forecast.', 'woo-ai-analytics' )
				);
			}
		} catch {
			setError(
				__( 'Network error. Please try again.', 'woo-ai-analytics' )
			);
		} finally {
			setGenerating( false );
		}
	}, [ generating, selectedDays, loadForecasts ] );

	const handleDelete = useCallback(
		async ( forecastId ) => {
			if (
				! window.confirm(
					__(
						'Are you sure you want to delete this forecast?',
						'woo-ai-analytics'
					)
				)
			) {
				return;
			}

			const formData = new FormData();
			formData.append( 'action', 'waa_delete_forecast' );
			formData.append( 'nonce', nonce );
			formData.append( 'forecastId', forecastId );

			try {
				const response = await fetch( ajaxUrl, {
					method: 'POST',
					body: formData,
				} );

				const result = await response.json();

				if ( result.success ) {
					if ( activeForecast?.id === forecastId ) {
						setActiveForecast( null );
					}
					await loadForecasts();
				} else {
					setError(
						result.data?.message ||
							__(
								'Failed to delete forecast.',
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
		[ activeForecast, loadForecasts ]
	);

	const handleView = useCallback(
		async ( forecastId ) => {
			const formData = new FormData();
			formData.append( 'action', 'waa_get_forecast' );
			formData.append( 'nonce', nonce );
			formData.append( 'forecastId', forecastId );

			try {
				const response = await fetch( ajaxUrl, {
					method: 'POST',
					body: formData,
				} );

				const result = await response.json();

				if ( result.success ) {
					setActiveForecast( result.data );
				} else {
					setError(
						result.data?.message ||
							__(
								'Failed to load forecast.',
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
		[]
	);

	const formatCurrency = ( value ) => {
		return '$' + Number( value ).toLocaleString( undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		} );
	};

	return (
		<div className="waa-revenue-forecast wrap">
			<h2>{ __( 'Revenue Forecast', 'woo-ai-analytics' ) }</h2>
			<p className="description">
				{ __(
					'Generate revenue forecasts based on your historical order data.',
					'woo-ai-analytics'
				) }
			</p>

			{ error && (
				<div className="notice notice-error inline">
					<p>{ error }</p>
				</div>
			) }

			<div style={ { marginBottom: '16px' } }>
				<label htmlFor="waa-forecast-days" style={ { marginRight: '8px' } }>
					{ __( 'Forecast horizon:', 'woo-ai-analytics' ) }
				</label>
				<select
					id="waa-forecast-days"
					value={ selectedDays }
					onChange={ ( e ) => setSelectedDays( Number( e.target.value ) ) }
					style={ { marginRight: '8px' } }
				>
					{ DAYS_OPTIONS.map( ( opt ) => (
						<option key={ opt.value } value={ opt.value }>
							{ opt.label }
						</option>
					) ) }
				</select>
				<button
					type="button"
					className="button button-primary"
					onClick={ handleGenerate }
					disabled={ generating || forecasts.length >= 10 }
				>
					{ generating
						? __( 'Generating…', 'woo-ai-analytics' )
						: __( 'Generate Forecast', 'woo-ai-analytics' ) }
				</button>
				{ forecasts.length >= 10 && (
					<span className="description" style={ { marginLeft: '8px' } }>
						{ __( 'Maximum of 10 forecasts reached. Delete one to generate a new one.', 'woo-ai-analytics' ) }
					</span>
				) }
			</div>

			{ activeForecast && (
				<div className="card" style={ { padding: '16px', marginBottom: '16px' } }>
					<h3>
						{ __( 'Forecast:', 'woo-ai-analytics' ) }{ ' ' }
						{ activeForecast.daysAhead }{ ' ' }
						{ __( 'days ahead', 'woo-ai-analytics' ) }
					</h3>
					<div style={ { display: 'flex', gap: '24px', marginBottom: '12px' } }>
						<div>
							<strong>{ __( 'Avg Daily Revenue:', 'woo-ai-analytics' ) }</strong>{ ' ' }
							{ formatCurrency( activeForecast.summary?.avgDailyRevenue ) }
						</div>
						<div>
							<strong>{ __( 'Projected Total:', 'woo-ai-analytics' ) }</strong>{ ' ' }
							{ formatCurrency( activeForecast.summary?.projectedTotal ) }
						</div>
						<div>
							<strong>{ __( 'Trend:', 'woo-ai-analytics' ) }</strong>{ ' ' }
							{ TREND_LABELS[ activeForecast.summary?.trend ] || activeForecast.summary?.trend }
						</div>
					</div>
					{ activeForecast.dataPoints?.length > 0 && (
						<table className="wp-list-table widefat fixed striped">
							<thead>
								<tr>
									<th>{ __( 'Date', 'woo-ai-analytics' ) }</th>
									<th>{ __( 'Predicted Revenue', 'woo-ai-analytics' ) }</th>
								</tr>
							</thead>
							<tbody>
								{ activeForecast.dataPoints.map( ( dp ) => (
									<tr key={ dp.date }>
										<td>{ dp.date }</td>
										<td>{ formatCurrency( dp.predicted ) }</td>
									</tr>
								) ) }
							</tbody>
						</table>
					) }
				</div>
			) }

			<h3>{ __( 'Saved Forecasts', 'woo-ai-analytics' ) }</h3>

			{ loading ? (
				<p>{ __( 'Loading…', 'woo-ai-analytics' ) }</p>
			) : forecasts.length === 0 ? (
				<p className="description">
					{ __(
						'No forecasts yet. Generate one to see projected revenue.',
						'woo-ai-analytics'
					) }
				</p>
			) : (
				<table className="wp-list-table widefat fixed striped">
					<thead>
						<tr>
							<th>{ __( 'Days Ahead', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Historical Days', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Trend', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Projected Total', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Created', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Actions', 'woo-ai-analytics' ) }</th>
						</tr>
					</thead>
					<tbody>
						{ forecasts.map( ( forecast ) => (
							<tr key={ forecast.id }>
								<td>{ forecast.daysAhead }</td>
								<td>{ forecast.historicalDays }</td>
								<td>{ TREND_LABELS[ forecast.summary?.trend ] || forecast.summary?.trend }</td>
								<td>{ formatCurrency( forecast.summary?.projectedTotal ) }</td>
								<td>
									{ forecast.createdAt
										? new Date( forecast.createdAt ).toLocaleString()
										: '' }
								</td>
								<td>
									<button
										type="button"
										className="button button-small"
										onClick={ () => handleView( forecast.id ) }
										style={ { marginRight: '4px' } }
									>
										{ __( 'View', 'woo-ai-analytics' ) }
									</button>
									<button
										type="button"
										className="button button-small button-link-delete"
										onClick={ () => handleDelete( forecast.id ) }
									>
										{ __( 'Delete', 'woo-ai-analytics' ) }
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
