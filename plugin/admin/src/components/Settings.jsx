import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

export default function Settings() {
  const { ajaxUrl, nonce, apiUrl: initialApiUrl, connected: initialConnected } =
    window.waaData || {};

  const [apiUrl, setApiUrl] = useState(initialApiUrl || '');
  const [connected, setConnected] = useState(initialConnected || false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const saveSettings = async () => {
    setLoading(true);
    setStatus('');

    const formData = new FormData();
    formData.append('action', 'waa_save_settings');
    formData.append('nonce', nonce);
    formData.append('api_url', apiUrl);

    try {
      const response = await fetch(ajaxUrl, { method: 'POST', body: formData });
      const data = await response.json();
      setStatus(data.data?.message || __('Saved.', 'woo-ai-analytics'));
    } catch {
      setStatus(__('Failed to save settings.', 'woo-ai-analytics'));
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setLoading(true);
    setStatus('');

    const formData = new FormData();
    formData.append('action', 'waa_test_connection');
    formData.append('nonce', nonce);

    try {
      const response = await fetch(ajaxUrl, { method: 'POST', body: formData });
      const data = await response.json();
      setConnected(data.success);
      setStatus(data.data?.message || __('Connection test complete.', 'woo-ai-analytics'));
    } catch {
      setConnected(false);
      setStatus(__('Connection test failed.', 'woo-ai-analytics'));
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    setLoading(true);
    setStatus('');

    const formData = new FormData();
    formData.append('action', 'waa_disconnect');
    formData.append('nonce', nonce);

    try {
      const response = await fetch(ajaxUrl, { method: 'POST', body: formData });
      const data = await response.json();
      setConnected(false);
      setStatus(data.data?.message || __('Disconnected.', 'woo-ai-analytics'));
    } catch {
      setStatus(__('Failed to disconnect.', 'woo-ai-analytics'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wrap">
      <h1>{__('AI Analytics Settings', 'woo-ai-analytics')}</h1>

      <table className="form-table">
        <tbody>
          <tr>
            <th scope="row">
              <label htmlFor="waa-api-url">
                {__('API URL', 'woo-ai-analytics')}
              </label>
            </th>
            <td>
              <input
                id="waa-api-url"
                type="url"
                className="regular-text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://api.example.com"
                disabled={loading}
              />
            </td>
          </tr>
          <tr>
            <th scope="row">{__('Status', 'woo-ai-analytics')}</th>
            <td>
              <span
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: connected ? '#00a32a' : '#d63638',
                  marginRight: 8,
                  verticalAlign: 'middle',
                }}
              />
              {connected
                ? __('Connected', 'woo-ai-analytics')
                : __('Not connected', 'woo-ai-analytics')}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="submit">
        <button
          type="button"
          className="button button-primary"
          onClick={saveSettings}
          disabled={loading}
        >
          {__('Save Settings', 'woo-ai-analytics')}
        </button>
        {' '}
        {!connected ? (
          <button
            type="button"
            className="button"
            onClick={testConnection}
            disabled={loading || !apiUrl}
          >
            {__('Test Connection', 'woo-ai-analytics')}
          </button>
        ) : (
          <button
            type="button"
            className="button"
            onClick={disconnect}
            disabled={loading}
          >
            {__('Disconnect', 'woo-ai-analytics')}
          </button>
        )}
      </p>

      {status && (
        <div className="notice notice-info inline">
          <p>{status}</p>
        </div>
      )}
    </div>
  );
}
