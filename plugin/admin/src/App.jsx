import { useState } from '@wordpress/element';
import Settings from './components/Settings';
import ChatWindow from './components/ChatWindow';
import OnboardingWizard from './components/OnboardingWizard';
import Dashboard from './components/Dashboard';
import ScheduledInsights from './components/ScheduledInsights';

const { page, onboardingComplete } = window.waaData || {};

export default function App() {
	const [ currentPage, setCurrentPage ] = useState( page );
	const [ showOnboarding, setShowOnboarding ] = useState(
		! onboardingComplete && currentPage === 'woo-ai-analytics'
	);

	if ( currentPage === 'woo-ai-analytics-settings' ) {
		return <Settings />;
	}

	if ( currentPage === 'woo-ai-analytics-scheduled-insights' ) {
		return <ScheduledInsights />;
	}

	if ( currentPage === 'woo-ai-analytics-dashboard' ) {
		return (
			<Dashboard
				onNavigateToChat={ () => setCurrentPage( 'woo-ai-analytics' ) }
			/>
		);
	}

	if ( showOnboarding ) {
		return (
			<OnboardingWizard onFinish={ () => setShowOnboarding( false ) } />
		);
	}

	return <ChatWindow />;
}
