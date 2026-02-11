import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import Settings from './components/Settings';

const { page } = window.waaData || {};

export default function App() {
  const [currentPage] = useState(page);

  if (currentPage === 'woo-ai-analytics-settings') {
    return <Settings />;
  }

  return (
    <div className="wrap">
      <h1>{__('AI Analytics', 'woo-ai-analytics')}</h1>
      <p>{__('Chat with your WooCommerce data coming soon.', 'woo-ai-analytics')}</p>
    </div>
  );
}
