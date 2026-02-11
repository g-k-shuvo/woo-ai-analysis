import type { Knex } from 'knex';
import bcrypt from 'bcrypt';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;

export interface StoreRecord {
  id: string;
  store_url: string;
  api_key_hash: string;
  wc_version: string | null;
  plan: string;
  connected_at: string;
  last_sync_at: string | null;
  settings: Record<string, unknown>;
  is_active: boolean;
}

export interface ConnectStoreInput {
  storeUrl: string;
  apiKey: string;
  wcVersion?: string;
}

export interface StoreStatus {
  storeId: string;
  storeUrl: string;
  plan: string;
  connectedAt: string;
  lastSyncAt: string | null;
  isActive: boolean;
}

export interface StoreServiceDeps {
  db: Knex;
}

export function createStoreService(deps: StoreServiceDeps) {
  const { db } = deps;

  async function connectStore(input: ConnectStoreInput): Promise<{ storeId: string }> {
    const { storeUrl, apiKey, wcVersion } = input;

    if (!storeUrl || typeof storeUrl !== 'string') {
      throw new ValidationError('storeUrl is required');
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 32) {
      throw new ValidationError('apiKey must be at least 32 characters');
    }

    const normalizedUrl = storeUrl.replace(/\/+$/, '').toLowerCase();
    const apiKeyHash = await bcrypt.hash(apiKey, BCRYPT_ROUNDS);

    // Check if store already exists
    const existing = await db('stores')
      .where({ store_url: normalizedUrl })
      .first<StoreRecord | undefined>();

    if (existing) {
      // Re-connect: update the API key and reactivate
      await db('stores').where({ id: existing.id }).update({
        api_key_hash: apiKeyHash,
        wc_version: wcVersion ?? existing.wc_version,
        is_active: true,
        connected_at: db.fn.now(),
      });

      logger.info({ storeId: existing.id, storeUrl: normalizedUrl }, 'Store reconnected');
      return { storeId: existing.id };
    }

    // New store
    const [inserted] = await db('stores')
      .insert({
        store_url: normalizedUrl,
        api_key_hash: apiKeyHash,
        wc_version: wcVersion ?? null,
      })
      .returning('id');

    const storeId = inserted.id;

    logger.info({ storeId, storeUrl: normalizedUrl }, 'New store connected');
    return { storeId };
  }

  async function getStoreById(storeId: string): Promise<StoreRecord> {
    const store = await db('stores')
      .where({ id: storeId })
      .first<StoreRecord | undefined>();

    if (!store) {
      throw new NotFoundError('Store not found');
    }
    return store;
  }

  async function getStoreByUrl(storeUrl: string): Promise<StoreRecord | undefined> {
    const normalizedUrl = storeUrl.replace(/\/+$/, '').toLowerCase();
    return db('stores').where({ store_url: normalizedUrl }).first<StoreRecord | undefined>();
  }

  async function getActiveStores(): Promise<StoreRecord[]> {
    return db('stores').where({ is_active: true });
  }

  async function verifyApiKey(storeUrl: string, apiKey: string): Promise<StoreRecord | null> {
    const store = await getStoreByUrl(storeUrl);
    if (!store || !store.is_active) {
      return null;
    }

    const isValid = await bcrypt.compare(apiKey, store.api_key_hash);
    return isValid ? store : null;
  }

  async function getStoreStatus(storeId: string): Promise<StoreStatus> {
    const store = await getStoreById(storeId);
    return {
      storeId: store.id,
      storeUrl: store.store_url,
      plan: store.plan,
      connectedAt: store.connected_at,
      lastSyncAt: store.last_sync_at,
      isActive: store.is_active,
    };
  }

  async function disconnectStore(storeId: string): Promise<void> {
    const store = await getStoreById(storeId);

    // Delete all store data in order (respecting foreign keys)
    const trx = await db.transaction();
    try {
      await trx('order_items').where({ store_id: store.id }).del();
      await trx('orders').where({ store_id: store.id }).del();
      await trx('products').where({ store_id: store.id }).del();
      await trx('customers').where({ store_id: store.id }).del();
      await trx('categories').where({ store_id: store.id }).del();
      await trx('coupons').where({ store_id: store.id }).del();
      await trx('saved_charts').where({ store_id: store.id }).del();
      await trx('conversations').where({ store_id: store.id }).del();
      await trx('sync_logs').where({ store_id: store.id }).del();
      await trx('stores').where({ id: store.id }).del();
      await trx.commit();

      logger.info({ storeId: store.id, storeUrl: store.store_url }, 'Store disconnected and data deleted');
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  }

  return {
    connectStore,
    getStoreById,
    getStoreByUrl,
    getActiveStores,
    verifyApiKey,
    getStoreStatus,
    disconnectStore,
  };
}

export type StoreService = ReturnType<typeof createStoreService>;
