import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Import module under test (after all mocks) ─────────────────────

const { createScheduledInsightsService } = await import(
  '../../../src/services/scheduledInsightsService.js'
);

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const INSIGHT_ID = 'aabb0000-1111-2222-3333-444455556666';

function makeInsightRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: INSIGHT_ID,
    store_id: STORE_ID,
    name: 'Daily Revenue Summary',
    frequency: 'daily',
    hour: 8,
    day_of_week: null,
    enabled: true,
    last_run_at: null,
    next_run_at: '2026-02-13T08:00:00.000Z',
    created_at: '2026-02-12T10:00:00.000Z',
    updated_at: '2026-02-12T10:00:00.000Z',
    ...overrides,
  };
}

interface MockQueryBuilder {
  where: jest.Mock<() => MockQueryBuilder>;
  andWhere: jest.Mock<() => MockQueryBuilder>;
  orderBy: jest.Mock<() => MockQueryBuilder>;
  count: jest.Mock<() => MockQueryBuilder>;
  select: jest.Mock<() => Promise<unknown[]>>;
  first: jest.Mock<() => Promise<unknown>>;
  insert: jest.Mock<() => MockQueryBuilder>;
  update: jest.Mock<() => MockQueryBuilder>;
  del: jest.Mock<() => Promise<number>>;
  returning: jest.Mock<() => Promise<unknown[]>>;
}

function createMockDb() {
  const builder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis() as MockQueryBuilder['where'],
    andWhere: jest.fn().mockReturnThis() as MockQueryBuilder['andWhere'],
    orderBy: jest.fn().mockReturnThis() as MockQueryBuilder['orderBy'],
    count: jest.fn().mockReturnThis() as MockQueryBuilder['count'],
    select: jest.fn() as MockQueryBuilder['select'],
    first: jest.fn() as MockQueryBuilder['first'],
    insert: jest.fn().mockReturnThis() as MockQueryBuilder['insert'],
    update: jest.fn().mockReturnThis() as MockQueryBuilder['update'],
    del: jest.fn() as MockQueryBuilder['del'],
    returning: jest.fn() as MockQueryBuilder['returning'],
  };

  const db = jest.fn().mockReturnValue(builder) as unknown as jest.Mock & {
    transaction: (cb: (trx: unknown) => Promise<unknown>) => Promise<unknown>;
  };
  // transaction() calls the callback with the same db function (trx acts as db inside transaction)
  (db as unknown as Record<string, unknown>).transaction = async (cb: (trx: unknown) => Promise<unknown>) => {
    return cb(db);
  };
  return { db, builder };
}

type ServiceDeps = Parameters<typeof createScheduledInsightsService>[0];

// ── Tests ───────────────────────────────────────────────────────────

describe('scheduledInsightsService', () => {
  let db: ReturnType<typeof createMockDb>['db'];
  let builder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMockDb();
    db = mocks.db;
    builder = mocks.builder;
  });

  // ── createInsight ─────────────────────────────────────────────────

  describe('createInsight()', () => {
    it('creates a daily insight and returns response', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([makeInsightRecord()]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.createInsight(STORE_ID, {
        name: 'Daily Revenue Summary',
        frequency: 'daily',
        hour: 8,
      });

      expect(result.id).toBe(INSIGHT_ID);
      expect(result.name).toBe('Daily Revenue Summary');
      expect(result.frequency).toBe('daily');
      expect(result.hour).toBe(8);
      expect(result.dayOfWeek).toBeNull();
      expect(result.enabled).toBe(true);
      expect(result.createdAt).toBe('2026-02-12T10:00:00.000Z');
    });

    it('creates a weekly insight with dayOfWeek', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([
        makeInsightRecord({ frequency: 'weekly', day_of_week: 1 }),
      ]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.createInsight(STORE_ID, {
        name: 'Weekly Digest',
        frequency: 'weekly',
        hour: 9,
        dayOfWeek: 1,
      });

      expect(result.frequency).toBe('weekly');
      expect(result.dayOfWeek).toBe(1);
    });

    it('throws ValidationError when name is empty', async () => {
      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.createInsight(STORE_ID, { name: '', frequency: 'daily', hour: 8 }),
      ).rejects.toThrow('Name is required');
    });

    it('throws ValidationError when name is too long', async () => {
      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.createInsight(STORE_ID, {
          name: 'a'.repeat(256),
          frequency: 'daily',
          hour: 8,
        }),
      ).rejects.toThrow('Name must not exceed 255 characters');
    });

    it('throws ValidationError for invalid frequency', async () => {
      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.createInsight(STORE_ID, {
          name: 'Test',
          frequency: 'monthly',
          hour: 8,
        }),
      ).rejects.toThrow('Frequency must be "daily" or "weekly"');
    });

    it('throws ValidationError when hour is negative', async () => {
      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.createInsight(STORE_ID, {
          name: 'Test',
          frequency: 'daily',
          hour: -1,
        }),
      ).rejects.toThrow('Hour must be an integer between 0 and 23');
    });

    it('throws ValidationError when hour is greater than 23', async () => {
      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.createInsight(STORE_ID, {
          name: 'Test',
          frequency: 'daily',
          hour: 24,
        }),
      ).rejects.toThrow('Hour must be an integer between 0 and 23');
    });

    it('throws ValidationError when hour is not an integer', async () => {
      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.createInsight(STORE_ID, {
          name: 'Test',
          frequency: 'daily',
          hour: 8.5,
        }),
      ).rejects.toThrow('Hour must be an integer between 0 and 23');
    });

    it('throws ValidationError when weekly schedule is missing dayOfWeek', async () => {
      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.createInsight(STORE_ID, {
          name: 'Test',
          frequency: 'weekly',
          hour: 8,
        }),
      ).rejects.toThrow('Day of week is required for weekly schedules');
    });

    it('throws ValidationError when dayOfWeek is out of range', async () => {
      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.createInsight(STORE_ID, {
          name: 'Test',
          frequency: 'weekly',
          hour: 8,
          dayOfWeek: 7,
        }),
      ).rejects.toThrow('Day of week must be an integer between 0 (Sunday) and 6 (Saturday)');
    });

    it('throws ValidationError when max schedules reached', async () => {
      builder.first.mockResolvedValueOnce({ count: '5' });

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.createInsight(STORE_ID, {
          name: 'Test',
          frequency: 'daily',
          hour: 8,
        }),
      ).rejects.toThrow('Maximum of 5 scheduled insights allowed per store');
    });

    it('filters by store_id when checking count', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([makeInsightRecord()]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.createInsight(STORE_ID, {
        name: 'Test',
        frequency: 'daily',
        hour: 8,
      });

      expect(builder.where).toHaveBeenCalledWith({ store_id: STORE_ID });
    });

    it('sets next_run_at to null when enabled is false', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([
        makeInsightRecord({ enabled: false, next_run_at: null }),
      ]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.createInsight(STORE_ID, {
        name: 'Test',
        frequency: 'daily',
        hour: 8,
        enabled: false,
      });

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          next_run_at: null,
          enabled: false,
        }),
      );
    });

    it('sets day_of_week to null for daily frequency', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([makeInsightRecord()]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.createInsight(STORE_ID, {
        name: 'Test',
        frequency: 'daily',
        hour: 8,
        dayOfWeek: 3,
      });

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          day_of_week: null,
        }),
      );
    });

    it('trims name whitespace', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([makeInsightRecord()]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.createInsight(STORE_ID, {
        name: '  Daily Revenue  ',
        frequency: 'daily',
        hour: 8,
      });

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Daily Revenue',
        }),
      );
    });

    it('logs on successful creation', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([makeInsightRecord()]);

      const { logger: mockLogger } = await import('../../../src/utils/logger.js');

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.createInsight(STORE_ID, {
        name: 'Test',
        frequency: 'daily',
        hour: 8,
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: STORE_ID, insightId: INSIGHT_ID }),
        'Scheduled insight created',
      );
    });

    it('accepts hour 0 (midnight)', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([makeInsightRecord({ hour: 0 })]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.createInsight(STORE_ID, {
        name: 'Midnight Report',
        frequency: 'daily',
        hour: 0,
      });

      expect(result.hour).toBe(0);
    });

    it('accepts hour 23', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([makeInsightRecord({ hour: 23 })]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.createInsight(STORE_ID, {
        name: 'Late Night Report',
        frequency: 'daily',
        hour: 23,
      });

      expect(result.hour).toBe(23);
    });

    it('accepts dayOfWeek 0 (Sunday)', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([
        makeInsightRecord({ frequency: 'weekly', day_of_week: 0 }),
      ]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.createInsight(STORE_ID, {
        name: 'Sunday Report',
        frequency: 'weekly',
        hour: 8,
        dayOfWeek: 0,
      });

      expect(result.dayOfWeek).toBe(0);
    });

    it('accepts dayOfWeek 6 (Saturday)', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.returning.mockResolvedValueOnce([
        makeInsightRecord({ frequency: 'weekly', day_of_week: 6 }),
      ]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.createInsight(STORE_ID, {
        name: 'Saturday Report',
        frequency: 'weekly',
        hour: 10,
        dayOfWeek: 6,
      });

      expect(result.dayOfWeek).toBe(6);
    });
  });

  // ── listInsights ──────────────────────────────────────────────────

  describe('listInsights()', () => {
    it('returns all insights for a store', async () => {
      builder.select.mockResolvedValueOnce([
        makeInsightRecord(),
        makeInsightRecord({ id: 'insight-2', name: 'Weekly Digest' }),
      ]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const results = await service.listInsights(STORE_ID);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(INSIGHT_ID);
      expect(results[1].id).toBe('insight-2');
    });

    it('returns empty array when no insights exist', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const results = await service.listInsights(STORE_ID);

      expect(results).toEqual([]);
    });

    it('filters by store_id', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.listInsights(STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: STORE_ID });
    });

    it('orders by created_at desc', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.listInsights(STORE_ID);

      expect(builder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('maps record fields to camelCase response', async () => {
      builder.select.mockResolvedValueOnce([
        makeInsightRecord({
          day_of_week: 3,
          last_run_at: '2026-02-11T08:00:00Z',
          next_run_at: '2026-02-13T08:00:00Z',
          created_at: '2026-02-10T10:00:00Z',
          updated_at: '2026-02-11T12:00:00Z',
        }),
      ]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const results = await service.listInsights(STORE_ID);

      expect(results[0].dayOfWeek).toBe(3);
      expect(results[0].lastRunAt).toBe('2026-02-11T08:00:00Z');
      expect(results[0].nextRunAt).toBe('2026-02-13T08:00:00Z');
      expect(results[0].createdAt).toBe('2026-02-10T10:00:00Z');
      expect(results[0].updatedAt).toBe('2026-02-11T12:00:00Z');
    });
  });

  // ── updateInsight ─────────────────────────────────────────────────

  describe('updateInsight()', () => {
    it('updates an existing insight and returns response', async () => {
      builder.first.mockResolvedValueOnce(makeInsightRecord());
      builder.returning.mockResolvedValueOnce([
        makeInsightRecord({ name: 'Updated Name' }),
      ]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      const result = await service.updateInsight(STORE_ID, INSIGHT_ID, {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
    });

    it('throws NotFoundError when insight does not exist', async () => {
      builder.first.mockResolvedValueOnce(undefined);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.updateInsight(STORE_ID, 'nonexistent', { name: 'Test' }),
      ).rejects.toThrow('Scheduled insight not found');
    });

    it('filters by both id and store_id when fetching', async () => {
      builder.first.mockResolvedValueOnce(makeInsightRecord());
      builder.returning.mockResolvedValueOnce([makeInsightRecord()]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.updateInsight(STORE_ID, INSIGHT_ID, { name: 'New' });

      expect(builder.where).toHaveBeenCalledWith({
        id: INSIGHT_ID,
        store_id: STORE_ID,
      });
    });

    it('throws ValidationError for empty name', async () => {
      builder.first.mockResolvedValueOnce(makeInsightRecord());

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.updateInsight(STORE_ID, INSIGHT_ID, { name: '' }),
      ).rejects.toThrow('Name is required');
    });

    it('throws ValidationError for name too long', async () => {
      builder.first.mockResolvedValueOnce(makeInsightRecord());

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.updateInsight(STORE_ID, INSIGHT_ID, { name: 'a'.repeat(256) }),
      ).rejects.toThrow('Name must not exceed 255 characters');
    });

    it('throws ValidationError for invalid frequency', async () => {
      builder.first.mockResolvedValueOnce(makeInsightRecord());

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.updateInsight(STORE_ID, INSIGHT_ID, { frequency: 'monthly' }),
      ).rejects.toThrow('Frequency must be "daily" or "weekly"');
    });

    it('throws ValidationError for invalid hour', async () => {
      builder.first.mockResolvedValueOnce(makeInsightRecord());

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.updateInsight(STORE_ID, INSIGHT_ID, { hour: 25 }),
      ).rejects.toThrow('Hour must be an integer between 0 and 23');
    });

    it('requires dayOfWeek when updating to weekly', async () => {
      builder.first.mockResolvedValueOnce(makeInsightRecord());

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.updateInsight(STORE_ID, INSIGHT_ID, { frequency: 'weekly' }),
      ).rejects.toThrow('Day of week is required for weekly schedules');
    });

    it('clears day_of_week when updating to daily', async () => {
      builder.first.mockResolvedValueOnce(
        makeInsightRecord({ frequency: 'weekly', day_of_week: 3 }),
      );
      builder.returning.mockResolvedValueOnce([
        makeInsightRecord({ frequency: 'daily', day_of_week: null }),
      ]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.updateInsight(STORE_ID, INSIGHT_ID, { frequency: 'daily' });

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          day_of_week: null,
        }),
      );
    });

    it('sets next_run_at to null when disabling', async () => {
      builder.first.mockResolvedValueOnce(makeInsightRecord());
      builder.returning.mockResolvedValueOnce([
        makeInsightRecord({ enabled: false, next_run_at: null }),
      ]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.updateInsight(STORE_ID, INSIGHT_ID, { enabled: false });

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          next_run_at: null,
          enabled: false,
        }),
      );
    });

    it('recomputes next_run_at when re-enabling', async () => {
      builder.first.mockResolvedValueOnce(
        makeInsightRecord({ enabled: false, next_run_at: null }),
      );
      builder.returning.mockResolvedValueOnce([makeInsightRecord()]);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.updateInsight(STORE_ID, INSIGHT_ID, { enabled: true });

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          next_run_at: expect.any(String),
        }),
      );
    });

    it('logs on successful update', async () => {
      builder.first.mockResolvedValueOnce(makeInsightRecord());
      builder.returning.mockResolvedValueOnce([makeInsightRecord()]);

      const { logger: mockLogger } = await import('../../../src/utils/logger.js');

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.updateInsight(STORE_ID, INSIGHT_ID, { name: 'New' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: STORE_ID, insightId: INSIGHT_ID }),
        'Scheduled insight updated',
      );
    });
  });

  // ── deleteInsight ─────────────────────────────────────────────────

  describe('deleteInsight()', () => {
    it('deletes an insight and returns void', async () => {
      builder.del.mockResolvedValueOnce(1);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.deleteInsight(STORE_ID, INSIGHT_ID),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundError when insight does not exist', async () => {
      builder.del.mockResolvedValueOnce(0);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await expect(
        service.deleteInsight(STORE_ID, 'nonexistent'),
      ).rejects.toThrow('Scheduled insight not found');
    });

    it('filters by both id and store_id', async () => {
      builder.del.mockResolvedValueOnce(1);

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.deleteInsight(STORE_ID, INSIGHT_ID);

      expect(builder.where).toHaveBeenCalledWith({
        id: INSIGHT_ID,
        store_id: STORE_ID,
      });
    });

    it('logs on successful deletion', async () => {
      builder.del.mockResolvedValueOnce(1);

      const { logger: mockLogger } = await import('../../../src/utils/logger.js');

      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      await service.deleteInsight(STORE_ID, INSIGHT_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: STORE_ID, insightId: INSIGHT_ID }),
        'Scheduled insight deleted',
      );
    });
  });

  // ── Factory ───────────────────────────────────────────────────────

  describe('createScheduledInsightsService factory', () => {
    it('returns object with all CRUD methods', () => {
      const service = createScheduledInsightsService({
        db: db as unknown as ServiceDeps['db'],
      });

      expect(service).toHaveProperty('createInsight');
      expect(service).toHaveProperty('listInsights');
      expect(service).toHaveProperty('updateInsight');
      expect(service).toHaveProperty('deleteInsight');
      expect(typeof service.createInsight).toBe('function');
      expect(typeof service.listInsights).toBe('function');
      expect(typeof service.updateInsight).toBe('function');
      expect(typeof service.deleteInsight).toBe('function');
    });
  });
});
