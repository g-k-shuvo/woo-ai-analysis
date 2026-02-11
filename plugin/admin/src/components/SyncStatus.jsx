import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import './SyncStatus.css';

const POLL_INTERVAL_MS = 10000;

function formatDate( dateStr ) {
	if ( ! dateStr ) {
		return __( 'Never', 'woo-ai-analytics' );
	}
	return new Date( dateStr ).toLocaleString();
}

function getStatusModifier( hasRunning, hasFailed ) {
	if ( hasRunning ) {
		return 'running';
	}
	if ( hasFailed ) {
		return 'failed';
	}
	return 'healthy';
}

function getHealthLabel( hasRunning, hasFailed ) {
	if ( hasRunning ) {
		return __( 'Sync in progress\u2026', 'woo-ai-analytics' );
	}
	if ( hasFailed ) {
		return __( 'Last sync had errors', 'woo-ai-analytics' );
	}
	return __( 'Sync healthy', 'woo-ai-analytics' );
}

function SyncHealthIndicator( { hasRunning, hasFailed } ) {
	const modifier = getStatusModifier( hasRunning, hasFailed );
	return (
		<div className="waa-sync-status__health">
			<span
				className={ `waa-sync-status__health-dot waa-sync-status__health-dot--${ modifier }` }
			/>
			<strong>{ getHealthLabel( hasRunning, hasFailed ) }</strong>
		</div>
	);
}

function RunningBanner() {
	return (
		<div className="waa-sync-status__running-banner">
			<div className="waa-sync-status__running-banner-inner">
				<span
					className="spinner is-active"
					style={ { float: 'none', margin: 0 } }
				/>
				<span>
					{ __(
						'A sync is currently running. Status will auto-refresh.',
						'woo-ai-analytics'
					) }
				</span>
			</div>
		</div>
	);
}

function RecordCountsTable( { recordCounts } ) {
	return (
		<>
			<h3>{ __( 'Synced Records', 'woo-ai-analytics' ) }</h3>
			<table className="widefat fixed striped waa-sync-status__counts-table">
				<thead>
					<tr>
						<th>{ __( 'Entity', 'woo-ai-analytics' ) }</th>
						<th>{ __( 'Count', 'woo-ai-analytics' ) }</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>{ __( 'Orders', 'woo-ai-analytics' ) }</td>
						<td>
							<strong>
								{ recordCounts.orders.toLocaleString() }
							</strong>
						</td>
					</tr>
					<tr>
						<td>{ __( 'Products', 'woo-ai-analytics' ) }</td>
						<td>
							<strong>
								{ recordCounts.products.toLocaleString() }
							</strong>
						</td>
					</tr>
					<tr>
						<td>{ __( 'Customers', 'woo-ai-analytics' ) }</td>
						<td>
							<strong>
								{ recordCounts.customers.toLocaleString() }
							</strong>
						</td>
					</tr>
					<tr>
						<td>{ __( 'Categories', 'woo-ai-analytics' ) }</td>
						<td>
							<strong>
								{ recordCounts.categories.toLocaleString() }
							</strong>
						</td>
					</tr>
				</tbody>
			</table>
		</>
	);
}

function getStatusBadgeModifier( status ) {
	if ( status === 'completed' ) {
		return 'completed';
	}
	if ( status === 'running' ) {
		return 'running';
	}
	return 'failed';
}

function StatusBadge( { status } ) {
	const modifier = getStatusBadgeModifier( status );
	return (
		<span
			className={ `waa-sync-status__badge waa-sync-status__badge--${ modifier }` }
		>
			{ status }
		</span>
	);
}

function RecentSyncsList( { recentSyncs } ) {
	if ( recentSyncs.length === 0 ) {
		return null;
	}

	return (
		<>
			<h3 className="waa-sync-status__recent-heading">
				{ __( 'Recent Sync Activity', 'woo-ai-analytics' ) }
			</h3>
			<table className="widefat fixed striped">
				<thead>
					<tr>
						<th>{ __( 'Type', 'woo-ai-analytics' ) }</th>
						<th>{ __( 'Records', 'woo-ai-analytics' ) }</th>
						<th>{ __( 'Status', 'woo-ai-analytics' ) }</th>
						<th>{ __( 'Started', 'woo-ai-analytics' ) }</th>
						<th>{ __( 'Error', 'woo-ai-analytics' ) }</th>
					</tr>
				</thead>
				<tbody>
					{ recentSyncs.map( ( sync ) => (
						<tr key={ sync.id }>
							<td>{ sync.syncType }</td>
							<td>{ sync.recordsSynced }</td>
							<td>
								<StatusBadge status={ sync.status } />
							</td>
							<td>{ formatDate( sync.startedAt ) }</td>
							<td className="waa-sync-status__error-text">
								{ sync.errorMessage || '\u2014' }
							</td>
						</tr>
					) ) }
				</tbody>
			</table>
		</>
	);
}

export default function SyncStatus() {
	const { ajaxUrl, nonce } = window.waaData || {};

	const [ syncData, setSyncData ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( '' );

	const fetchSyncStatus = useCallback( async () => {
		const formData = new FormData();
		formData.append( 'action', 'waa_sync_status' );
		formData.append( 'nonce', nonce );

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );
			const data = await response.json();
			if ( data.success ) {
				setSyncData( data.data );
				setError( '' );
			} else {
				setError(
					data.data?.message ||
						__( 'Failed to fetch sync status.', 'woo-ai-analytics' )
				);
			}
		} catch {
			setError(
				__( 'Failed to fetch sync status.', 'woo-ai-analytics' )
			);
		} finally {
			setLoading( false );
		}
	}, [ ajaxUrl, nonce ] );

	useEffect( () => {
		fetchSyncStatus();
	}, [ fetchSyncStatus ] );

	// Auto-refresh while a sync is running
	useEffect( () => {
		if ( ! syncData ) {
			return;
		}

		const hasRunning = syncData.recentSyncs.some(
			( s ) => s.status === 'running'
		);
		if ( ! hasRunning ) {
			return;
		}

		const interval = setInterval( fetchSyncStatus, POLL_INTERVAL_MS );
		return () => clearInterval( interval );
	}, [ syncData, fetchSyncStatus ] );

	if ( loading ) {
		return (
			<div className="waa-sync-status">
				<h2>{ __( 'Sync Status', 'woo-ai-analytics' ) }</h2>
				<p>{ __( 'Loading sync status…', 'woo-ai-analytics' ) }</p>
			</div>
		);
	}

	if ( error ) {
		return (
			<div className="waa-sync-status">
				<h2>{ __( 'Sync Status', 'woo-ai-analytics' ) }</h2>
				<div className="notice notice-error inline">
					<p>{ error }</p>
				</div>
			</div>
		);
	}

	if ( ! syncData ) {
		return null;
	}

	const { lastSyncAt, recordCounts, recentSyncs } = syncData;
	const hasRunning = recentSyncs.some( ( s ) => s.status === 'running' );
	const hasFailed = recentSyncs.some( ( s ) => s.status === 'failed' );

	return (
		<div className="waa-sync-status">
			<h2>{ __( 'Sync Status', 'woo-ai-analytics' ) }</h2>

			<SyncHealthIndicator
				hasRunning={ hasRunning }
				hasFailed={ hasFailed }
			/>

			{ hasRunning && <RunningBanner /> }

			{ /* Last sync time */ }
			<table className="form-table">
				<tbody>
					<tr>
						<th scope="row">
							{ __( 'Last Sync', 'woo-ai-analytics' ) }
						</th>
						<td>{ formatDate( lastSyncAt ) }</td>
					</tr>
				</tbody>
			</table>

			<RecordCountsTable recordCounts={ recordCounts } />
			<RecentSyncsList recentSyncs={ recentSyncs } />
		</div>
	);
}
