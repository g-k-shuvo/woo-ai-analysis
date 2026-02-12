import { useState } from '@wordpress/element';
import Settings from './components/Settings';
import ChatWindow from './components/ChatWindow';
import OnboardingWizard from './components/OnboardingWizard';

const { page, onboardingComplete } = window.waaData || {};

export default function App() {
	const [ currentPage ] = useState( page );
	const [ showOnboarding, setShowOnboarding ] = useState(
		! onboardingComplete && currentPage === 'woo-ai-analytics'
	);

	if ( currentPage === 'woo-ai-analytics-settings' ) {
		return <Settings />;
	}

	if ( showOnboarding ) {
		return (
			<OnboardingWizard onFinish={ () => setShowOnboarding( false ) } />
		);
	}

	return <ChatWindow />;
}
