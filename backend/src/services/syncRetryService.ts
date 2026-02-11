import type { Knex } from 'knex';
import { logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';

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
  const backoffSeconds = Math.min(
    Math.pow(2, retryCount) * BASE_BACKOFF_SECONDS,
    MAX_BACKOFF_SECONDS,
  );
  return backoffSeconds;
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
    const syncLog = await db('sync_logs')
      .select('id', 'retry_count', 'status')
      .where({ id: syncLogId, store_id: storeId })
      .first<{ id: string; retry_count: number; status: string } | undefined>();

    if (!syncLog) {
      throw new NotFoundError('Sync log not found');
    }

    if (syncLog.status !== 'failed') {
      throw new NotFoundError('Sync log is not in failed state');
    }

    if (syncLog.retry_count >= MAX_RETRIES) {
      return {
        syncLogId,
        status: 'max_retries_reached',
        nextRetryAt: null,
      };
    }

    const backoffSeconds = calculateBackoff(syncLog.retry_count);
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

    await db('sync_logs')
      .where({ id: syncLogId, store_id: storeId })
      .update({
        next_retry_at: nextRetryAt,
      });

    logger.info(
      { storeId, syncLogId, retryCount: syncLog.retry_count, backoffSeconds, nextRetryAt },
      'Retry scheduled for failed sync',
    );

    return {
      syncLogId,
      status: 'retry_scheduled',
      nextRetryAt,
    };
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
        error_message: 'Sync stalled — exceeded 15 minute threshold',
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
