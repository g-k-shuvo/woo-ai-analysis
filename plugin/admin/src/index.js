import { createRoot } from '@wordpress/element';
import App from './App';

const rootElement = document.getElementById( 'woo-ai-analytics-root' );

if ( rootElement ) {
	const root = createRoot( rootElement );
	root.render( <App /> );
}
