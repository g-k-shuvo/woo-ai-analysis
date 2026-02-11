import { useState } from '@wordpress/element';
import Settings from './components/Settings';
import ChatWindow from './components/ChatWindow';

const { page } = window.waaData || {};

export default function App() {
	const [ currentPage ] = useState( page );

	if ( currentPage === 'woo-ai-analytics-settings' ) {
		return <Settings />;
	}

	return <ChatWindow />;
}
