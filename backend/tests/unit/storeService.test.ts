import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ValidationError, NotFoundError } from '../../src/utils/errors.js';

// ESM-compatible mocks — must be set up BEFORE dynamic import
const mockHash = jest.fn<() => Promise<string>>().mockResolvedValue('$2b$12$hashedvalue');
const mockCompare = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);

jest.unstable_mockModule('bcrypt', () => ({
  default: { hash: mockHash, compare: mockCompare },
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Dynamic import AFTER mocks are set up
const { createStoreService } = await import('../../src/services/storeService.js');

interface MockQueryBuilder {
  where: jest.Mock;
  first: jest.Mock<() => Promise<unknown>>;
  insert: jest.Mock;
  returning: jest.Mock;
  update: jest.Mock;
  del: jest.Mock;
}

function createMockDb() {
  const mockQueryBuilder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    first: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    insert: jest.fn().mockReturnThis(),
    returning: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([{ id: 'test-uuid-123' }]),
    update: jest.fn<() => Promise<number>>().mockResolvedValue(1),
    del: jest.fn<() => Promise<number>>().mockResolvedValue(0),
  };

  const mockTrx = {
    ...mockQueryBuilder,
    commit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    rollback: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  // Make the trx callable (as a query builder)
  const trxFn = jest.fn().mockReturnValue(mockQueryBuilder);
  Object.assign(trxFn, mockTrx);

  const db = jest.fn().mockReturnValue(mockQueryBuilder);
  Object.assign(db, {
    fn: { now: jest.fn().mockReturnValue('NOW()') },
    transaction: jest.fn<() => Promise<unknown>>().mockResolvedValue(trxFn),
  });

  return { db: db as any, mockQueryBuilder, trxFn }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('StoreService', () => {
  let db: ReturnType<typeof createMockDb>['db'];
  let mockQueryBuilder: ReturnType<typeof createMockDb>['mockQueryBuilder'];

  beforeEach(() => {
    jest.clearAllMocks();
    mockHash.mockResolvedValue('$2b$12$hashedvalue');
    mockCompare.mockResolvedValue(true);
    const mocks = createMockDb();
    db = mocks.db;
    mockQueryBuilder = mocks.mockQueryBuilder;
  });

  describe('connectStore', () => {
    it('creates a new store with hashed API key', async () => {
      const service = createStoreService({ db });

      const result = await service.connectStore({
        storeUrl: 'https://myshop.com',
        apiKey: 'a'.repeat(64),
        wcVersion: '9.0',
      });

      expect(result.storeId).toBe('test-uuid-123');
      expect(mockHash).toHaveBeenCalledWith('a'.repeat(64), 12);
      expect(db).toHaveBeenCalledWith('stores');
    });

    it('normalizes store URL (removes trailing slash, lowercases)', async () => {
      const service = createStoreService({ db });

      await service.connectStore({
        storeUrl: 'https://MyShop.com///',
        apiKey: 'a'.repeat(64),
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({
        store_url: 'https://myshop.com',
      });
    });

    it('reconnects existing store with new API key', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'existing-uuid',
        store_url: 'https://myshop.com',
        wc_version: '8.0',
      });

      const service = createStoreService({ db });

      const result = await service.connectStore({
        storeUrl: 'https://myshop.com',
        apiKey: 'b'.repeat(64),
        wcVersion: '9.0',
      });

      expect(result.storeId).toBe('existing-uuid');
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          api_key_hash: '$2b$12$hashedvalue',
          wc_version: '9.0',
          is_active: true,
        }),
      );
    });

    it('throws ValidationError when storeUrl is empty', async () => {
      const service = createStoreService({ db });

      await expect(
        service.connectStore({ storeUrl: '', apiKey: 'a'.repeat(64) }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when apiKey is too short', async () => {
      const service = createStoreService({ db });

      await expect(
        service.connectStore({ storeUrl: 'https://shop.com', apiKey: 'short' }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError when apiKey is missing', async () => {
      const service = createStoreService({ db });

      await expect(
        service.connectStore({ storeUrl: 'https://shop.com', apiKey: '' }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getStoreById', () => {
    it('returns store when found', async () => {
      const mockStore = {
        id: 'store-123',
        store_url: 'https://myshop.com',
        plan: 'free',
        is_active: true,
      };
      mockQueryBuilder.first.mockResolvedValueOnce(mockStore);

      const service = createStoreService({ db });
      const result = await service.getStoreById('store-123');

      expect(result).toEqual(mockStore);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'store-123' });
    });

    it('throws NotFoundError when store not found', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(undefined);

      const service = createStoreService({ db });

      await expect(service.getStoreById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getStoreByUrl', () => {
    it('returns store when found by URL', async () => {
      const mockStore = { id: 'store-123', store_url: 'https://myshop.com' };
      mockQueryBuilder.first.mockResolvedValueOnce(mockStore);

      const service = createStoreService({ db });
      const result = await service.getStoreByUrl('https://myshop.com');

      expect(result).toEqual(mockStore);
    });

    it('returns undefined when store not found', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(undefined);

      const service = createStoreService({ db });
      const result = await service.getStoreByUrl('https://unknown.com');

      expect(result).toBeUndefined();
    });
  });

  describe('verifyApiKey', () => {
    it('returns store when API key is valid', async () => {
      const mockStore = {
        id: 'store-123',
        store_url: 'https://myshop.com',
        api_key_hash: '$2b$12$hashedvalue',
        is_active: true,
      };
      mockQueryBuilder.first.mockResolvedValueOnce(mockStore);
      mockCompare.mockResolvedValueOnce(true);

      const service = createStoreService({ db });
      const result = await service.verifyApiKey('https://myshop.com', 'validkey');

      expect(result).toEqual(mockStore);
    });

    it('returns null when store not found', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(undefined);

      const service = createStoreService({ db });
      const result = await service.verifyApiKey('https://unknown.com', 'anykey');

      expect(result).toBeNull();
    });

    it('returns null when store is inactive', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce({
        id: 'store-123',
        is_active: false,
      });

      const service = createStoreService({ db });
      const result = await service.verifyApiKey('https://myshop.com', 'anykey');

      expect(result).toBeNull();
    });

    it('returns null when API key is invalid', async () => {
      const mockStore = {
        id: 'store-123',
        store_url: 'https://myshop.com',
        api_key_hash: '$2b$12$hashedvalue',
        is_active: true,
      };
      mockQueryBuilder.first.mockResolvedValueOnce(mockStore);
      mockCompare.mockResolvedValueOnce(false);

      const service = createStoreService({ db });
      const result = await service.verifyApiKey('https://myshop.com', 'wrongkey');

      expect(result).toBeNull();
    });
  });

  describe('getStoreStatus', () => {
    it('returns formatted store status', async () => {
      const mockStore = {
        id: 'store-123',
        store_url: 'https://myshop.com',
        plan: 'free',
        connected_at: '2026-01-01T00:00:00Z',
        last_sync_at: null,
        is_active: true,
      };
      mockQueryBuilder.first.mockResolvedValueOnce(mockStore);

      const service = createStoreService({ db });
      const status = await service.getStoreStatus('store-123');

      expect(status).toEqual({
        storeId: 'store-123',
        storeUrl: 'https://myshop.com',
        plan: 'free',
        connectedAt: '2026-01-01T00:00:00Z',
        lastSyncAt: null,
        isActive: true,
      });
    });

    it('throws NotFoundError when store not found', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(undefined);

      const service = createStoreService({ db });

      await expect(service.getStoreStatus('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('disconnectStore', () => {
    it('deletes all store data in transaction', async () => {
      const mockStore = {
        id: 'store-123',
        store_url: 'https://myshop.com',
      };
      mockQueryBuilder.first.mockResolvedValueOnce(mockStore);

      const service = createStoreService({ db });
      await service.disconnectStore('store-123');

      // Verify transaction was committed
      const trxFn = await db.transaction();
      expect(trxFn.commit).toHaveBeenCalled();
    });

    it('throws NotFoundError when store not found', async () => {
      mockQueryBuilder.first.mockResolvedValueOnce(undefined);

      const service = createStoreService({ db });

      await expect(service.disconnectStore('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });
});
