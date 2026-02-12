import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import PropTypes from 'prop-types';
import useOnboarding from '../hooks/useOnboarding';
import useChat from '../hooks/useChat';

const SAMPLE_QUESTION = __(
	'What was my total revenue this month?',
	'woo-ai-analytics'
);

function StepIndicator( { currentStep, totalSteps } ) {
	return (
		<div className="waa-onboarding__steps" role="progressbar" aria-valuenow={ currentStep + 1 } aria-valuemin={ 1 } aria-valuemax={ totalSteps }>
			{ Array.from( { length: totalSteps }, ( _, i ) => (
				<span
					key={ i }
					className={ `waa-onboarding__step-dot${
						i === currentStep ? ' waa-onboarding__step-dot--active' : ''
					}${ i < currentStep ? ' waa-onboarding__step-dot--completed' : '' }` }
				/>
			) ) }
		</div>
	);
}

StepIndicator.propTypes = {
	currentStep: PropTypes.number.isRequired,
	totalSteps: PropTypes.number.isRequired,
};

function WelcomeStep( { onNext } ) {
	return (
		<div className="waa-onboarding__content">
			<h2>{ __( 'Welcome to AI Analytics', 'woo-ai-analytics' ) }</h2>
			<p>
				{ __(
					'Get insights about your WooCommerce store by asking questions in plain English. AI Analytics connects to your store data and generates answers, charts, and reports instantly.',
					'woo-ai-analytics'
				) }
			</p>
			<ul className="waa-onboarding__features">
				<li>{ __( 'Ask questions about revenue, orders, products, and customers', 'woo-ai-analytics' ) }</li>
				<li>{ __( 'Get visual charts and data tables', 'woo-ai-analytics' ) }</li>
				<li>{ __( 'All data stays secure and isolated', 'woo-ai-analytics' ) }</li>
			</ul>
			<button
				type="button"
				className="button button-primary button-hero"
				onClick={ onNext }
			>
				{ __( 'Get Started', 'woo-ai-analytics' ) }
			</button>
		</div>
	);
}

WelcomeStep.propTypes = {
	onNext: PropTypes.func.isRequired,
};

function ConnectStep( { onConnected, connected, onNext } ) {
	const {
		ajaxUrl,
		nonce,
		apiUrl: initialApiUrl,
	} = window.waaData || {};

	const [ apiUrl, setApiUrl ] = useState( initialApiUrl || '' );
	const [ loading, setLoading ] = useState( false );
	const [ status, setStatus ] = useState( '' );
	const [ statusType, setStatusType ] = useState( 'info' );

	// If already connected, allow advancing directly.
	useEffect( () => {
		if ( connected ) {
			setStatus( __( 'Already connected!', 'woo-ai-analytics' ) );
			setStatusType( 'success' );
		}
	}, [ connected ] );

	const saveAndConnect = async () => {
		setLoading( true );
		setStatus( '' );

		// Save API URL first.
		const saveForm = new FormData();
		saveForm.append( 'action', 'waa_save_settings' );
		saveForm.append( 'nonce', nonce );
		saveForm.append( 'api_url', apiUrl );

		try {
			const saveResp = await fetch( ajaxUrl, {
				method: 'POST',
				body: saveForm,
			} );
			const saveData = await saveResp.json();
			if ( ! saveData.success ) {
				setStatusType( 'error' );
				setStatus(
					saveData.data?.message ||
						__( 'Failed to save API URL.', 'woo-ai-analytics' )
				);
				setLoading( false );
				return;
			}
		} catch {
			setStatusType( 'error' );
			setStatus(
				__( 'Failed to save settings.', 'woo-ai-analytics' )
			);
			setLoading( false );
			return;
		}

		// Now connect.
		const connectForm = new FormData();
		connectForm.append( 'action', 'waa_connect' );
		connectForm.append( 'nonce', nonce );

		try {
			const resp = await fetch( ajaxUrl, {
				method: 'POST',
				body: connectForm,
			} );
			const data = await resp.json();
			if ( data.success ) {
				setStatusType( 'success' );
				setStatus(
					data.data?.message ||
						__( 'Connected!', 'woo-ai-analytics' )
				);
				onConnected();
			} else {
				setStatusType( 'error' );
				setStatus(
					data.data?.message ||
						__( 'Connection failed.', 'woo-ai-analytics' )
				);
			}
		} catch {
			setStatusType( 'error' );
			setStatus(
				__( 'Connection failed.', 'woo-ai-analytics' )
			);
		} finally {
			setLoading( false );
		}
	};

	return (
		<div className="waa-onboarding__content">
			<h2>{ __( 'Connect Your Store', 'woo-ai-analytics' ) }</h2>
			<p>
				{ __(
					'Enter the API URL of your Woo AI Analytics backend service to connect your store.',
					'woo-ai-analytics'
				) }
			</p>

			{ ! connected ? (
				<>
					<div className="waa-onboarding__field">
						<label htmlFor="waa-onboarding-api-url">
							{ __( 'API URL', 'woo-ai-analytics' ) }
						</label>
						<input
							id="waa-onboarding-api-url"
							type="url"
							className="regular-text"
							value={ apiUrl }
							onChange={ ( e ) => setApiUrl( e.target.value ) }
							placeholder="https://api.example.com"
							disabled={ loading }
						/>
					</div>
					<button
						type="button"
						className="button button-primary"
						onClick={ saveAndConnect }
						disabled={ loading || ! apiUrl }
					>
						{ loading
							? __( 'Connecting\u2026', 'woo-ai-analytics' )
							: __( 'Connect Store', 'woo-ai-analytics' ) }
					</button>
				</>
			) : (
				<>
					<div className="notice notice-success inline">
						<p>{ __( 'Store is connected.', 'woo-ai-analytics' ) }</p>
					</div>
					<button
						type="button"
						className="button button-primary"
						onClick={ onNext }
					>
						{ __( 'Continue', 'woo-ai-analytics' ) }
					</button>
				</>
			) }

			{ status && (
				<div className={ `notice notice-${ statusType } inline` } style={ { marginTop: 12 } }>
					<p>{ status }</p>
				</div>
			) }
		</div>
	);
}

ConnectStep.propTypes = {
	onConnected: PropTypes.func.isRequired,
	connected: PropTypes.bool.isRequired,
	onNext: PropTypes.func.isRequired,
};

function SyncStep( { onNext, fetchOnboardingStatus } ) {
	const [ syncData, setSyncData ] = useState( null );
	const [ loading, setLoading ] = useState( true );
	const [ error, setError ] = useState( '' );

	const pollStatus = useCallback( async () => {
		const result = await fetchOnboardingStatus();
		if ( result ) {
			setSyncData( result );
			setError( '' );
		} else {
			setError( __( 'Failed to check sync status.', 'woo-ai-analytics' ) );
		}
		setLoading( false );
	}, [ fetchOnboardingStatus ] );

	useEffect( () => {
		pollStatus();
	}, [ pollStatus ] );

	// Poll while waiting for data.
	useEffect( () => {
		if ( syncData?.hasSyncedData ) {
			return;
		}

		const interval = setInterval( pollStatus, 10000 );
		return () => clearInterval( interval );
	}, [ syncData, pollStatus ] );

	const hasSyncedData = syncData?.hasSyncedData || false;
	const counts = syncData?.recordCounts || {
		orders: 0,
		products: 0,
		customers: 0,
		categories: 0,
	};

	return (
		<div className="waa-onboarding__content">
			<h2>{ __( 'Sync Your Data', 'woo-ai-analytics' ) }</h2>
			<p>
				{ __(
					'Your WooCommerce data is being synced to the analytics backend. This happens automatically.',
					'woo-ai-analytics'
				) }
			</p>

			{ loading && (
				<p>{ __( 'Checking sync status\u2026', 'woo-ai-analytics' ) }</p>
			) }

			{ error && (
				<div className="notice notice-error inline">
					<p>{ error }</p>
				</div>
			) }

			{ ! loading && syncData && (
				<>
					<table className="widefat fixed striped" style={ { maxWidth: 400 } }>
						<thead>
							<tr>
								<th>{ __( 'Entity', 'woo-ai-analytics' ) }</th>
								<th>{ __( 'Records', 'woo-ai-analytics' ) }</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>{ __( 'Orders', 'woo-ai-analytics' ) }</td>
								<td><strong>{ counts.orders.toLocaleString() }</strong></td>
							</tr>
							<tr>
								<td>{ __( 'Products', 'woo-ai-analytics' ) }</td>
								<td><strong>{ counts.products.toLocaleString() }</strong></td>
							</tr>
							<tr>
								<td>{ __( 'Customers', 'woo-ai-analytics' ) }</td>
								<td><strong>{ counts.customers.toLocaleString() }</strong></td>
							</tr>
							<tr>
								<td>{ __( 'Categories', 'woo-ai-analytics' ) }</td>
								<td><strong>{ counts.categories.toLocaleString() }</strong></td>
							</tr>
						</tbody>
					</table>

					{ hasSyncedData ? (
						<div style={ { marginTop: 16 } }>
							<div className="notice notice-success inline" style={ { marginBottom: 12 } }>
								<p>{ __( 'Data synced successfully!', 'woo-ai-analytics' ) }</p>
							</div>
							<button
								type="button"
								className="button button-primary"
								onClick={ onNext }
							>
								{ __( 'Continue', 'woo-ai-analytics' ) }
							</button>
						</div>
					) : (
						<div style={ { marginTop: 16 } }>
							<span
								className="spinner is-active"
								style={ { float: 'none', margin: 0, marginRight: 8 } }
							/>
							<span>
								{ __(
									'Waiting for data sync\u2026 This page auto-refreshes.',
									'woo-ai-analytics'
								) }
							</span>
						</div>
					) }
				</>
			) }
		</div>
	);
}

SyncStep.propTypes = {
	onNext: PropTypes.func.isRequired,
	fetchOnboardingStatus: PropTypes.func.isRequired,
};

function AskStep( { onComplete } ) {
	const { messages, loading, sendMessage } = useChat();
	const [ asked, setAsked ] = useState( false );

	const handleAsk = () => {
		if ( ! asked ) {
			sendMessage( SAMPLE_QUESTION );
			setAsked( true );
		}
	};

	const lastMessage = messages.length > 0 ? messages[ messages.length - 1 ] : null;
	const hasAnswer =
		lastMessage && lastMessage.role === 'assistant' && ! loading;

	return (
		<div className="waa-onboarding__content">
			<h2>
				{ __( 'Ask Your First Question', 'woo-ai-analytics' ) }
			</h2>
			<p>
				{ __(
					'Try asking a question about your store data. Click the button below to see AI Analytics in action!',
					'woo-ai-analytics'
				) }
			</p>

			{ ! asked && (
				<button
					type="button"
					className="button button-primary"
					onClick={ handleAsk }
					disabled={ loading }
				>
					{ __( 'Ask:', 'woo-ai-analytics' ) }{ ' ' }
					{ SAMPLE_QUESTION }
				</button>
			) }

			{ asked && loading && (
				<div style={ { marginTop: 12 } }>
					<span
						className="spinner is-active"
						style={ { float: 'none', margin: 0, marginRight: 8 } }
					/>
					<span>
						{ __( 'AI is thinking\u2026', 'woo-ai-analytics' ) }
					</span>
				</div>
			) }

			{ hasAnswer && (
				<div style={ { marginTop: 12 } }>
					<div className="notice notice-success inline" style={ { marginBottom: 12 } }>
						<p>
							<strong>{ __( 'Answer:', 'woo-ai-analytics' ) }</strong>{ ' ' }
							{ lastMessage.data?.answer || lastMessage.content }
						</p>
					</div>
					<button
						type="button"
						className="button button-primary button-hero"
						onClick={ onComplete }
					>
						{ __(
							'Finish Setup',
							'woo-ai-analytics'
						) }
					</button>
				</div>
			) }

			{ asked && lastMessage?.role === 'error' && (
				<div style={ { marginTop: 12 } }>
					<div className="notice notice-warning inline" style={ { marginBottom: 12 } }>
						<p>
							{ __(
								'The AI query encountered an issue, but don\u2019t worry \u2014 you can try again from the chat screen.',
								'woo-ai-analytics'
							) }
						</p>
					</div>
					<button
						type="button"
						className="button button-primary"
						onClick={ onComplete }
					>
						{ __( 'Finish Setup', 'woo-ai-analytics' ) }
					</button>
				</div>
			) }
		</div>
	);
}

AskStep.propTypes = {
	onComplete: PropTypes.func.isRequired,
};

export default function OnboardingWizard( { onFinish } ) {
	const {
		currentStep,
		stepName,
		totalSteps,
		connected,
		goToNextStep,
		fetchOnboardingStatus,
		completeOnboarding,
		dismissOnboarding,
		onConnected,
	} = useOnboarding();

	const handleComplete = async () => {
		await completeOnboarding();
		onFinish();
	};

	const handleDismiss = async () => {
		await dismissOnboarding();
		onFinish();
	};

	return (
		<div className="wrap waa-onboarding">
			<div className="waa-onboarding__card">
				<StepIndicator
					currentStep={ currentStep }
					totalSteps={ totalSteps }
				/>

				{ stepName === 'welcome' && (
					<WelcomeStep onNext={ goToNextStep } />
				) }

				{ stepName === 'connect' && (
					<ConnectStep
						onConnected={ onConnected }
						connected={ connected }
						onNext={ goToNextStep }
					/>
				) }

				{ stepName === 'sync' && (
					<SyncStep
						onNext={ goToNextStep }
						fetchOnboardingStatus={ fetchOnboardingStatus }
					/>
				) }

				{ stepName === 'ask' && (
					<AskStep onComplete={ handleComplete } />
				) }

				<div className="waa-onboarding__footer">
					<button
						type="button"
						className="button-link"
						onClick={ handleDismiss }
					>
						{ __( 'Skip setup', 'woo-ai-analytics' ) }
					</button>
					<span className="waa-onboarding__step-label">
						{ `${ currentStep + 1 } / ${ totalSteps }` }
					</span>
				</div>
			</div>
		</div>
	);
}

OnboardingWizard.propTypes = {
	onFinish: PropTypes.func.isRequired,
};
