import { useState, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const STEPS = [ 'welcome', 'connect', 'sync', 'ask' ];

export default function useOnboarding() {
	const { ajaxUrl, nonce, connected: initialConnected } = window.waaData || {};

	const [ currentStep, setCurrentStep ] = useState( 0 );
	const [ connected, setConnected ] = useState( initialConnected || false );
	const [ syncStatus, setSyncStatus ] = useState( null );
	const [ loading, setLoading ] = useState( false );
	const [ error, setError ] = useState( '' );

	const stepName = STEPS[ currentStep ] || 'welcome';
	const totalSteps = STEPS.length;

	const goToNextStep = useCallback( () => {
		setCurrentStep( ( prev ) => Math.min( prev + 1, STEPS.length - 1 ) );
		setError( '' );
	}, [] );

	const goToPrevStep = useCallback( () => {
		setCurrentStep( ( prev ) => Math.max( prev - 1, 0 ) );
		setError( '' );
	}, [] );

	const fetchOnboardingStatus = useCallback( async () => {
		setLoading( true );
		setError( '' );

		const formData = new FormData();
		formData.append( 'action', 'waa_onboarding_status' );
		formData.append( 'nonce', nonce );

		try {
			const response = await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );
			const data = await response.json();
			if ( data.success ) {
				setSyncStatus( data.data );
				return data.data;
			}
			setError(
				data.data?.message ||
					__( 'Failed to fetch status.', 'woo-ai-analytics' )
			);
			return null;
		} catch {
			setError(
				__( 'Failed to fetch onboarding status.', 'woo-ai-analytics' )
			);
			return null;
		} finally {
			setLoading( false );
		}
	}, [ ajaxUrl, nonce ] );

	const completeOnboarding = useCallback( async () => {
		const formData = new FormData();
		formData.append( 'action', 'waa_complete_onboarding' );
		formData.append( 'nonce', nonce );

		try {
			await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );
		} catch {
			// Best-effort — wizard will still close.
		}
	}, [ ajaxUrl, nonce ] );

	const dismissOnboarding = useCallback( async () => {
		const formData = new FormData();
		formData.append( 'action', 'waa_dismiss_onboarding' );
		formData.append( 'nonce', nonce );

		try {
			await fetch( ajaxUrl, {
				method: 'POST',
				body: formData,
			} );
		} catch {
			// Best-effort — wizard will still close.
		}
	}, [ ajaxUrl, nonce ] );

	const onConnected = useCallback( () => {
		setConnected( true );
		goToNextStep();
	}, [ goToNextStep ] );

	return {
		currentStep,
		stepName,
		totalSteps,
		connected,
		syncStatus,
		loading,
		error,
		goToNextStep,
		goToPrevStep,
		fetchOnboardingStatus,
		completeOnboarding,
		dismissOnboarding,
		onConnected,
		setConnected,
	};
}
