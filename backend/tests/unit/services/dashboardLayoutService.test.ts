import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createDashboardLayoutService } = await import(
  '../../../src/services/dashboardLayoutService.js'
);

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

interface MockTrxBuilder {
  where: jest.Mock<() => MockTrxBuilder>;
  update: jest.Mock<() => Promise<number>>;
}

interface MockTrx {
  (tableName: string): MockTrxBuilder;
  fn: { now: jest.Mock<() => string> };
  commit: jest.Mock<() => Promise<void>>;
  rollback: jest.Mock<() => Promise<void>>;
}

interface MockDb {
  transaction: jest.Mock<() => Promise<unknown>>;
}

function createMockDb(): { db: MockDb; trxBuilder: MockTrxBuilder; trx: MockTrx } {
  const trxBuilder: MockTrxBuilder = {
    where: jest.fn().mockReturnThis() as MockTrxBuilder['where'],
    update: jest.fn() as MockTrxBuilder['update'],
  };

  const trx = jest.fn().mockReturnValue(trxBuilder) as unknown as MockTrx;
  trx.fn = { now: jest.fn().mockReturnValue('NOW()') as MockTrx['fn']['now'] };
  trx.commit = jest.fn() as MockTrx['commit'];
  trx.rollback = jest.fn() as MockTrx['rollback'];

  const db: MockDb = {
    transaction: jest.fn<() => Promise<unknown>>().mockResolvedValue(trx),
  };

  return { db, trxBuilder, trx };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('dashboardLayoutService', () => {
  let db: MockDb;
  let trxBuilder: MockTrxBuilder;
  let trx: MockTrx;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMockDb();
    db = mocks.db;
    trxBuilder = mocks.trxBuilder;
    trx = mocks.trx;
  });

  describe('updateGridLayout()', () => {
    it('updates grid positions for each chart in a transaction', async () => {
      trxBuilder.update.mockResolvedValue(1);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await service.updateGridLayout(STORE_ID, [
        { id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
        { id: 'chart-2', gridX: 6, gridY: 0, gridW: 6, gridH: 4 },
      ]);

      expect(trx.commit).toHaveBeenCalled();
      expect(trxBuilder.update).toHaveBeenCalledTimes(2);
    });

    it('passes correct grid values to update', async () => {
      trxBuilder.update.mockResolvedValue(1);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await service.updateGridLayout(STORE_ID, [
        { id: 'chart-1', gridX: 3, gridY: 2, gridW: 9, gridH: 6 },
      ]);

      expect(trxBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          grid_x: 3,
          grid_y: 2,
          grid_w: 9,
          grid_h: 6,
        }),
      );
    });

    it('filters by store_id and chart id', async () => {
      trxBuilder.update.mockResolvedValue(1);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await service.updateGridLayout(STORE_ID, [
        { id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
      ]);

      expect(trxBuilder.where).toHaveBeenCalledWith({
        id: 'chart-1',
        store_id: STORE_ID,
      });
    });

    it('sets updated_at timestamp', async () => {
      trxBuilder.update.mockResolvedValue(1);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await service.updateGridLayout(STORE_ID, [
        { id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
      ]);

      expect(trxBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ updated_at: 'NOW()' }),
      );
    });

    it('throws ValidationError for empty items array', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(service.updateGridLayout(STORE_ID, [])).rejects.toThrow(
        'items must be a non-empty array',
      );
    });

    it('throws ValidationError for non-array items', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, null as unknown as []),
      ).rejects.toThrow('items must be a non-empty array');
    });

    it('throws ValidationError for missing id', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: '', gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
        ]),
      ).rejects.toThrow('Each item must have a valid id');
    });

    it('throws ValidationError for negative gridX', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'chart-1', gridX: -1, gridY: 0, gridW: 6, gridH: 4 },
        ]),
      ).rejects.toThrow('gridX must be a non-negative number');
    });

    it('throws ValidationError for negative gridY', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'chart-1', gridX: 0, gridY: -1, gridW: 6, gridH: 4 },
        ]),
      ).rejects.toThrow('gridY must be between 0 and 1000');
    });

    it('throws ValidationError for gridY above maximum (1000)', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'chart-1', gridX: 0, gridY: 1001, gridW: 6, gridH: 4 },
        ]),
      ).rejects.toThrow('gridY must be between 0 and 1000');
    });

    it('throws ValidationError when items exceed maxItems (20)', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `chart-${i}`,
        gridX: 0,
        gridY: i * 4,
        gridW: 6,
        gridH: 4,
      }));

      await expect(service.updateGridLayout(STORE_ID, items)).rejects.toThrow(
        'Cannot update more than 20 items at once',
      );
    });

    it('throws ValidationError for gridW below minimum (3)', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'chart-1', gridX: 0, gridY: 0, gridW: 2, gridH: 4 },
        ]),
      ).rejects.toThrow('gridW must be between 3 and 12');
    });

    it('throws ValidationError for gridW above maximum (12)', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'chart-1', gridX: 0, gridY: 0, gridW: 13, gridH: 4 },
        ]),
      ).rejects.toThrow('gridW must be between 3 and 12');
    });

    it('throws ValidationError for gridH below minimum (2)', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 1 },
        ]),
      ).rejects.toThrow('gridH must be between 2 and 8');
    });

    it('throws ValidationError for gridH above maximum (8)', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'chart-1', gridX: 0, gridY: 0, gridW: 6, gridH: 9 },
        ]),
      ).rejects.toThrow('gridH must be between 2 and 8');
    });

    it('throws ValidationError when item exceeds grid width', async () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'chart-1', gridX: 10, gridY: 0, gridW: 6, gridH: 4 },
        ]),
      ).rejects.toThrow('Item exceeds grid width');
    });

    it('throws NotFoundError when chart does not exist', async () => {
      trxBuilder.update.mockResolvedValue(0);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'nonexistent', gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
        ]),
      ).rejects.toThrow('Chart with id nonexistent not found');
    });

    it('rolls back transaction on error', async () => {
      trxBuilder.update.mockResolvedValue(0);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'nonexistent', gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
        ]),
      ).rejects.toThrow();

      expect(trx.rollback).toHaveBeenCalled();
    });

    it('does not commit when update fails', async () => {
      trxBuilder.update.mockResolvedValue(0);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await expect(
        service.updateGridLayout(STORE_ID, [
          { id: 'nonexistent', gridX: 0, gridY: 0, gridW: 6, gridH: 4 },
        ]),
      ).rejects.toThrow();

      expect(trx.commit).not.toHaveBeenCalled();
    });

    it('accepts boundary valid gridW=3 and gridH=2', async () => {
      trxBuilder.update.mockResolvedValue(1);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await service.updateGridLayout(STORE_ID, [
        { id: 'chart-1', gridX: 0, gridY: 0, gridW: 3, gridH: 2 },
      ]);

      expect(trx.commit).toHaveBeenCalled();
    });

    it('accepts boundary valid gridW=12 and gridH=8', async () => {
      trxBuilder.update.mockResolvedValue(1);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await service.updateGridLayout(STORE_ID, [
        { id: 'chart-1', gridX: 0, gridY: 0, gridW: 12, gridH: 8 },
      ]);

      expect(trx.commit).toHaveBeenCalled();
    });

    it('accepts gridX + gridW exactly equal to 12', async () => {
      trxBuilder.update.mockResolvedValue(1);

      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      await service.updateGridLayout(STORE_ID, [
        { id: 'chart-1', gridX: 6, gridY: 0, gridW: 6, gridH: 4 },
      ]);

      expect(trx.commit).toHaveBeenCalled();
    });
  });

  describe('factory', () => {
    it('returns object with updateGridLayout method', () => {
      const service = createDashboardLayoutService({
        db: db as unknown as Parameters<typeof createDashboardLayoutService>[0]['db'],
      });

      expect(service).toHaveProperty('updateGridLayout');
      expect(typeof service.updateGridLayout).toBe('function');
    });
  });
});
