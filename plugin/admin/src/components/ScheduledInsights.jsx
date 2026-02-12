import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const { ajaxUrl, nonce } = window.waaData || {};

const DAYS_OF_WEEK = [
	__( 'Sunday', 'woo-ai-analytics' ),
	__( 'Monday', 'woo-ai-analytics' ),
	__( 'Tuesday', 'woo-ai-analytics' ),
	__( 'Wednesday', 'woo-ai-analytics' ),
	__( 'Thursday', 'woo-ai-analytics' ),
	__( 'Friday', 'woo-ai-analytics' ),
	__( 'Saturday', 'woo-ai-analytics' ),
];

export default function ScheduledInsights() {
	const [ insights, setInsights ] = useState( [] );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( null );
	const [ creating, setCreating ] = useState( false );
	const [ showForm, setShowForm ] = useState( false );

	// Form state
	const [ formName, setFormName ] = useState( '' );
	const [ formFrequency, setFormFrequency ] = useState( 'daily' );
	const [ formHour, setFormHour ] = useState( 8 );
	const [ formDayOfWeek, setFormDayOfWeek ] = useState( 1 );

	const loadInsights = useCallback( async () => {
		setLoading( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_list_scheduled_insights' );
		formData.append( 'nonce', nonce );

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( result.success && result.data?.insights ) {
				setInsights( result.data.insights );
			} else {
				setError(
					result.data?.message ||
						__( 'Failed to load scheduled insights.', 'woo-ai-analytics' )
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
		loadInsights();
	}, [ loadInsights ] );

	const handleCreate = useCallback( async () => {
		if ( creating || ! formName.trim() ) {
			return;
		}

		setCreating( true );
		setError( null );

		const formData = new FormData();
		formData.append( 'action', 'waa_create_scheduled_insight' );
		formData.append( 'nonce', nonce );
		formData.append( 'name', formName );
		formData.append( 'frequency', formFrequency );
		formData.append( 'hour', String( formHour ) );
		if ( formFrequency === 'weekly' ) {
			formData.append( 'dayOfWeek', String( formDayOfWeek ) );
		}

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );

			const result = await response.json();

			if ( result.success ) {
				setShowForm( false );
				setFormName( '' );
				setFormFrequency( 'daily' );
				setFormHour( 8 );
				setFormDayOfWeek( 1 );
				await loadInsights();
			} else {
				setError(
					result.data?.message ||
						__( 'Failed to create scheduled insight.', 'woo-ai-analytics' )
				);
			}
		} catch {
			setError(
				__( 'Network error. Please try again.', 'woo-ai-analytics' )
			);
		} finally {
			setCreating( false );
		}
	}, [ creating, formName, formFrequency, formHour, formDayOfWeek, loadInsights ] );

	const handleToggle = useCallback(
		async ( insightId, currentEnabled ) => {
			const formData = new FormData();
			formData.append( 'action', 'waa_update_scheduled_insight' );
			formData.append( 'nonce', nonce );
			formData.append( 'insightId', insightId );
			formData.append( 'enabled', currentEnabled ? 'false' : 'true' );

			try {
				const response = await fetch( ajaxUrl, {
					method: 'POST',
					body: formData,
				} );

				const result = await response.json();

				if ( result.success ) {
					await loadInsights();
				} else {
					setError(
						result.data?.message ||
							__(
								'Failed to update scheduled insight.',
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
		[ loadInsights ]
	);

	const handleDelete = useCallback(
		async ( insightId ) => {
			const formData = new FormData();
			formData.append( 'action', 'waa_delete_scheduled_insight' );
			formData.append( 'nonce', nonce );
			formData.append( 'insightId', insightId );

			try {
				const response = await fetch( ajaxUrl, {
					method: 'POST',
					body: formData,
				} );

				const result = await response.json();

				if ( result.success ) {
					await loadInsights();
				} else {
					setError(
						result.data?.message ||
							__(
								'Failed to delete scheduled insight.',
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
		[ loadInsights ]
	);

	const hourOptions = [];
	for ( let h = 0; h < 24; h++ ) {
		const label = h === 0 ? '12:00 AM' : h < 12 ? `${ h }:00 AM` : h === 12 ? '12:00 PM' : `${ h - 12 }:00 PM`;
		hourOptions.push(
			<option key={ h } value={ h }>
				{ label } (UTC)
			</option>
		);
	}

	return (
		<div className="waa-scheduled-insights wrap">
			<h2>{ __( 'Scheduled Insights', 'woo-ai-analytics' ) }</h2>
			<p className="description">
				{ __(
					'Set up automated daily or weekly insight digests.',
					'woo-ai-analytics'
				) }
			</p>

			{ error && (
				<div className="notice notice-error inline">
					<p>{ error }</p>
				</div>
			) }

			{ ! showForm && (
				<p>
					<button
						type="button"
						className="button button-primary"
						onClick={ () => setShowForm( true ) }
						disabled={ insights.length >= 5 }
					>
						{ __( 'Add Scheduled Insight', 'woo-ai-analytics' ) }
					</button>
					{ insights.length >= 5 && (
						<span className="description" style={ { marginLeft: '8px' } }>
							{ __( 'Maximum of 5 scheduled insights reached.', 'woo-ai-analytics' ) }
						</span>
					) }
				</p>
			) }

			{ showForm && (
				<div className="waa-scheduled-insights__form card" style={ { padding: '16px', marginBottom: '16px' } }>
					<h3>{ __( 'New Scheduled Insight', 'woo-ai-analytics' ) }</h3>
					<table className="form-table">
						<tbody>
							<tr>
								<th scope="row">
									<label htmlFor="waa-si-name">
										{ __( 'Name', 'woo-ai-analytics' ) }
									</label>
								</th>
								<td>
									<input
										id="waa-si-name"
										type="text"
										className="regular-text"
										value={ formName }
										onChange={ ( e ) => setFormName( e.target.value ) }
										placeholder={ __( 'e.g., Daily Revenue Summary', 'woo-ai-analytics' ) }
									/>
								</td>
							</tr>
							<tr>
								<th scope="row">
									<label htmlFor="waa-si-frequency">
										{ __( 'Frequency', 'woo-ai-analytics' ) }
									</label>
								</th>
								<td>
									<select
										id="waa-si-frequency"
										value={ formFrequency }
										onChange={ ( e ) => setFormFrequency( e.target.value ) }
									>
										<option value="daily">
											{ __( 'Daily', 'woo-ai-analytics' ) }
										</option>
										<option value="weekly">
											{ __( 'Weekly', 'woo-ai-analytics' ) }
										</option>
									</select>
								</td>
							</tr>
							{ formFrequency === 'weekly' && (
								<tr>
									<th scope="row">
										<label htmlFor="waa-si-day">
											{ __( 'Day of Week', 'woo-ai-analytics' ) }
										</label>
									</th>
									<td>
										<select
											id="waa-si-day"
											value={ formDayOfWeek }
											onChange={ ( e ) =>
												setFormDayOfWeek( Number( e.target.value ) )
											}
										>
											{ DAYS_OF_WEEK.map( ( day, i ) => (
												<option key={ i } value={ i }>
													{ day }
												</option>
											) ) }
										</select>
									</td>
								</tr>
							) }
							<tr>
								<th scope="row">
									<label htmlFor="waa-si-hour">
										{ __( 'Time', 'woo-ai-analytics' ) }
									</label>
								</th>
								<td>
									<select
										id="waa-si-hour"
										value={ formHour }
										onChange={ ( e ) =>
											setFormHour( Number( e.target.value ) )
										}
									>
										{ hourOptions }
									</select>
								</td>
							</tr>
						</tbody>
					</table>
					<p>
						<button
							type="button"
							className="button button-primary"
							onClick={ handleCreate }
							disabled={ creating || ! formName.trim() }
						>
							{ creating
								? __( 'Creating…', 'woo-ai-analytics' )
								: __( 'Create', 'woo-ai-analytics' ) }
						</button>
						<button
							type="button"
							className="button button-secondary"
							onClick={ () => setShowForm( false ) }
							style={ { marginLeft: '8px' } }
						>
							{ __( 'Cancel', 'woo-ai-analytics' ) }
						</button>
					</p>
				</div>
			) }

			{ loading ? (
				<p>{ __( 'Loading…', 'woo-ai-analytics' ) }</p>
			) : insights.length === 0 ? (
				<p className="description">
					{ __(
						'No scheduled insights yet. Create one to get automated digests.',
						'woo-ai-analytics'
					) }
				</p>
			) : (
				<table className="wp-list-table widefat fixed striped">
					<thead>
						<tr>
							<th>{ __( 'Name', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Frequency', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Time', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Enabled', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Next Run', 'woo-ai-analytics' ) }</th>
							<th>{ __( 'Actions', 'woo-ai-analytics' ) }</th>
						</tr>
					</thead>
					<tbody>
						{ insights.map( ( insight ) => (
							<tr key={ insight.id }>
								<td>{ insight.name }</td>
								<td>
									{ insight.frequency === 'weekly'
										? `${ __( 'Weekly', 'woo-ai-analytics' ) } (${ DAYS_OF_WEEK[ insight.dayOfWeek ] || '' })`
										: __( 'Daily', 'woo-ai-analytics' ) }
								</td>
								<td>{ `${ insight.hour }:00 UTC` }</td>
								<td>
									<button
										type="button"
										className={ `button button-small ${ insight.enabled ? 'button-primary' : '' }` }
										onClick={ () =>
											handleToggle( insight.id, insight.enabled )
										}
									>
										{ insight.enabled
											? __( 'On', 'woo-ai-analytics' )
											: __( 'Off', 'woo-ai-analytics' ) }
									</button>
								</td>
								<td>
									{ insight.nextRunAt
										? new Date( insight.nextRunAt ).toLocaleString()
										: __( 'Disabled', 'woo-ai-analytics' ) }
								</td>
								<td>
									<button
										type="button"
										className="button button-small button-link-delete"
										onClick={ () => handleDelete( insight.id ) }
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
