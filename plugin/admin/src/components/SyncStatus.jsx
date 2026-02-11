import { useState, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const POLL_INTERVAL_MS = 10000;

export default function SyncStatus() {
  const { ajaxUrl, nonce } = window.waaData || {};

  const [syncData, setSyncData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSyncStatus = useCallback(async () => {
    const formData = new FormData();
    formData.append('action', 'waa_sync_status');
    formData.append('nonce', nonce);

    try {
      const response = await fetch(ajaxUrl, { method: 'POST', body: formData });
      const data = await response.json();
      if (data.success) {
        setSyncData(data.data);
        setError('');
      } else {
        setError(data.data?.message || __('Failed to fetch sync status.', 'woo-ai-analytics'));
      }
    } catch {
      setError(__('Failed to fetch sync status.', 'woo-ai-analytics'));
    } finally {
      setLoading(false);
    }
  }, [ajaxUrl, nonce]);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  // Auto-refresh while a sync is running
  useEffect(() => {
    if (!syncData) return;

    const hasRunning = syncData.recentSyncs.some((s) => s.status === 'running');
    if (!hasRunning) return;

    const interval = setInterval(fetchSyncStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [syncData, fetchSyncStatus]);

  if (loading) {
    return (
      <div className="waa-sync-status" style={{ marginTop: 20 }}>
        <h2>{__('Sync Status', 'woo-ai-analytics')}</h2>
        <p>{__('Loading sync status...', 'woo-ai-analytics')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="waa-sync-status" style={{ marginTop: 20 }}>
        <h2>{__('Sync Status', 'woo-ai-analytics')}</h2>
        <div className="notice notice-error inline">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!syncData) return null;

  const { lastSyncAt, recordCounts, recentSyncs } = syncData;
  const hasRunning = recentSyncs.some((s) => s.status === 'running');
  const hasFailed = recentSyncs.some((s) => s.status === 'failed');

  const formatDate = (dateStr) => {
    if (!dateStr) return __('Never', 'woo-ai-analytics');
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="waa-sync-status" style={{ marginTop: 20 }}>
      <h2>{__('Sync Status', 'woo-ai-analytics')}</h2>

      {/* Health indicator */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: hasRunning ? '#dba617' : hasFailed ? '#d63638' : '#00a32a',
          }}
        />
        <strong>
          {hasRunning
            ? __('Sync in progress...', 'woo-ai-analytics')
            : hasFailed
              ? __('Last sync had errors', 'woo-ai-analytics')
              : __('Sync healthy', 'woo-ai-analytics')}
        </strong>
      </div>

      {/* Running sync progress bar */}
      {hasRunning && (
        <div
          style={{
            marginBottom: 16,
            padding: '8px 12px',
            background: '#fff8e1',
            border: '1px solid #dba617',
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner is-active" style={{ float: 'none', margin: 0 }} />
            <span>{__('A sync is currently running. Status will auto-refresh.', 'woo-ai-analytics')}</span>
          </div>
        </div>
      )}

      {/* Last sync time */}
      <table className="form-table">
        <tbody>
          <tr>
            <th scope="row">{__('Last Sync', 'woo-ai-analytics')}</th>
            <td>{formatDate(lastSyncAt)}</td>
          </tr>
        </tbody>
      </table>

      {/* Record counts */}
      <h3>{__('Synced Records', 'woo-ai-analytics')}</h3>
      <table className="widefat fixed striped" style={{ maxWidth: 400 }}>
        <thead>
          <tr>
            <th>{__('Entity', 'woo-ai-analytics')}</th>
            <th>{__('Count', 'woo-ai-analytics')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{__('Orders', 'woo-ai-analytics')}</td>
            <td><strong>{recordCounts.orders.toLocaleString()}</strong></td>
          </tr>
          <tr>
            <td>{__('Products', 'woo-ai-analytics')}</td>
            <td><strong>{recordCounts.products.toLocaleString()}</strong></td>
          </tr>
          <tr>
            <td>{__('Customers', 'woo-ai-analytics')}</td>
            <td><strong>{recordCounts.customers.toLocaleString()}</strong></td>
          </tr>
          <tr>
            <td>{__('Categories', 'woo-ai-analytics')}</td>
            <td><strong>{recordCounts.categories.toLocaleString()}</strong></td>
          </tr>
        </tbody>
      </table>

      {/* Recent syncs */}
      {recentSyncs.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>{__('Recent Sync Activity', 'woo-ai-analytics')}</h3>
          <table className="widefat fixed striped">
            <thead>
              <tr>
                <th>{__('Type', 'woo-ai-analytics')}</th>
                <th>{__('Records', 'woo-ai-analytics')}</th>
                <th>{__('Status', 'woo-ai-analytics')}</th>
                <th>{__('Started', 'woo-ai-analytics')}</th>
                <th>{__('Error', 'woo-ai-analytics')}</th>
              </tr>
            </thead>
            <tbody>
              {recentSyncs.map((sync) => (
                <tr key={sync.id}>
                  <td>{sync.syncType}</td>
                  <td>{sync.recordsSynced}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 3,
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#fff',
                        backgroundColor:
                          sync.status === 'completed'
                            ? '#00a32a'
                            : sync.status === 'running'
                              ? '#dba617'
                              : '#d63638',
                      }}
                    >
                      {sync.status}
                    </span>
                  </td>
                  <td>{formatDate(sync.startedAt)}</td>
                  <td style={{ color: '#d63638' }}>
                    {sync.errorMessage || '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
