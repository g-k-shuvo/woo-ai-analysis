import type { Knex } from 'knex';
import { logger } from '../utils/logger.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

export const MAX_RETRIES = 5;
export const BASE_BACKOFF_SECONDS = 30;
export const MAX_BACKOFF_SECONDS = 900; // 15 minutes
export const STALE_SYNC_THRESHOLD_MINUTES = 15;

export interface FailedSyncEntry {
  id: string;
  syncType: string;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  startedAt: string;
}

export interface RetryScheduleResult {
  syncLogId: string;
  status: 'retry_scheduled' | 'max_retries_reached';
  nextRetryAt: string | null;
}

interface FailedSyncDbRow {
  id: string;
  sync_type: string;
  error_message: string | null;
  retry_count: number;
  next_retry_at: string | null;
  started_at: string;
}

export interface SyncRetryServiceDeps {
  db: Knex;
}

export function calculateBackoff(retryCount: number): number {
  const base = Math.min(
    Math.pow(2, retryCount) * BASE_BACKOFF_SECONDS,
    MAX_BACKOFF_SECONDS,
  );
  // Add +/- 20% jitter to avoid thundering herd
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(1, Math.round(base + jitter));
}

export function createSyncRetryService(deps: SyncRetryServiceDeps) {
  const { db } = deps;

  async function getFailedSyncs(storeId: string): Promise<FailedSyncEntry[]> {
    const rows: FailedSyncDbRow[] = await db('sync_logs')
      .select('id', 'sync_type', 'error_message', 'retry_count', 'next_retry_at', 'started_at')
      .where({ store_id: storeId, status: 'failed' })
      .where('retry_count', '<', MAX_RETRIES)
      .orderBy('started_at', 'desc')
      .limit(50);

    return rows.map((row) => ({
      id: row.id,
      syncType: row.sync_type,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      nextRetryAt: row.next_retry_at,
      startedAt: row.started_at,
    }));
  }

  async function scheduleRetry(storeId: string, syncLogId: string): Promise<RetryScheduleResult> {
    // Atomic conditional update: only updates if status=failed AND retry_count < MAX_RETRIES
    const updatedCount = await db('sync_logs')
      .where({ id: syncLogId, store_id: storeId, status: 'failed' })
      .where('retry_count', '<', MAX_RETRIES)
      .update({
        retry_count: db.raw('retry_count + 1'),
      });

    if (updatedCount === 0) {
      // Determine the specific reason for failure
      const syncLog = await db('sync_logs')
        .select('id', 'status', 'retry_count')
        .where({ id: syncLogId, store_id: storeId })
        .first<{ id: string; status: string; retry_count: number } | undefined>();

      if (!syncLog) {
        throw new NotFoundError('Sync log not found');
      }
      if (syncLog.status !== 'failed') {
        throw new ValidationError('Sync log is not in failed state -- only failed syncs can be retried');
      }
      if (syncLog.retry_count >= MAX_RETRIES) {
        return { syncLogId, status: 'max_retries_reached', nextRetryAt: null };
      }
    }

    // Read the updated retry_count to compute the correct backoff
    const updated = await db('sync_logs')
      .select('retry_count')
      .where({ id: syncLogId, store_id: storeId })
      .first<{ retry_count: number }>();

    const backoffSeconds = calculateBackoff(updated!.retry_count - 1);
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

    await db('sync_logs')
      .where({ id: syncLogId, store_id: storeId })
      .update({ next_retry_at: nextRetryAt });

    logger.info(
      { storeId, syncLogId, retryCount: updated!.retry_count, backoffSeconds, nextRetryAt },
      'Retry scheduled for failed sync',
    );

    return { syncLogId, status: 'retry_scheduled', nextRetryAt };
  }

  async function markRetryStarted(storeId: string, syncLogId: string): Promise<void> {
    await db('sync_logs')
      .where({ id: syncLogId, store_id: storeId })
      .update({
        status: 'running',
        retry_count: db.raw('retry_count + 1'),
        next_retry_at: null,
        error_message: null,
        completed_at: null,
        started_at: db.fn.now(),
      });
  }

  async function getDueRetries(storeId: string): Promise<FailedSyncEntry[]> {
    const rows: FailedSyncDbRow[] = await db('sync_logs')
      .select('id', 'sync_type', 'error_message', 'retry_count', 'next_retry_at', 'started_at')
      .where({ store_id: storeId, status: 'failed' })
      .where('retry_count', '<', MAX_RETRIES)
      .where('next_retry_at', '<=', db.fn.now())
      .orderBy('next_retry_at', 'asc')
      .limit(10);

    return rows.map((row) => ({
      id: row.id,
      syncType: row.sync_type,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      nextRetryAt: row.next_retry_at,
      startedAt: row.started_at,
    }));
  }

  async function detectStaleSyncs(storeId: string): Promise<number> {
    const thresholdDate = new Date(
      Date.now() - STALE_SYNC_THRESHOLD_MINUTES * 60 * 1000,
    ).toISOString();

    const updatedCount = await db('sync_logs')
      .where({ store_id: storeId, status: 'running' })
      .where('started_at', '<', thresholdDate)
      .update({
        status: 'failed',
        error_message: `Sync stalled -- exceeded ${STALE_SYNC_THRESHOLD_MINUTES} minute threshold`,
        completed_at: db.fn.now(),
      });

    if (updatedCount > 0) {
      logger.warn(
        { storeId, staleSyncsDetected: updatedCount },
        'Stale syncs detected and marked as failed',
      );
    }

    return updatedCount;
  }

  return {
    getFailedSyncs,
    scheduleRetry,
    markRetryStarted,
    getDueRetries,
    detectStaleSyncs,
  };
}

export type SyncRetryService = ReturnType<typeof createSyncRetryService>;
