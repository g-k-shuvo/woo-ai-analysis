import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createSavedChartsService } = await import('../../../src/services/savedChartsService.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CHART_ID = '660e8400-e29b-41d4-a716-446655440001';

function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: CHART_ID,
    store_id: STORE_ID,
    title: 'Revenue by Product',
    query_text: 'Show revenue by product',
    chart_config: JSON.stringify({ type: 'bar', data: { labels: ['A'], datasets: [] } }),
    position_index: 0,
    grid_x: 0,
    grid_y: 0,
    grid_w: 6,
    grid_h: 4,
    created_at: '2026-02-12T00:00:00Z',
    updated_at: '2026-02-12T00:00:00Z',
    ...overrides,
  };
}

interface MockQueryBuilder {
  where: jest.Mock<() => MockQueryBuilder>;
  count: jest.Mock<() => MockQueryBuilder>;
  max: jest.Mock<() => MockQueryBuilder>;
  insert: jest.Mock<() => MockQueryBuilder>;
  returning: jest.Mock<() => Promise<unknown[]>>;
  orderBy: jest.Mock<() => MockQueryBuilder>;
  select: jest.Mock<() => Promise<unknown[]>>;
  first: jest.Mock<() => Promise<unknown>>;
  update: jest.Mock<() => MockQueryBuilder>;
  del: jest.Mock<() => Promise<number>>;
  fn: { now: jest.Mock<() => string> };
  transaction: jest.Mock<() => Promise<unknown>>;
}

function createMockDb() {
  const builder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis() as MockQueryBuilder['where'],
    count: jest.fn().mockReturnThis() as MockQueryBuilder['count'],
    max: jest.fn().mockReturnThis() as MockQueryBuilder['max'],
    insert: jest.fn().mockReturnThis() as MockQueryBuilder['insert'],
    returning: jest.fn() as MockQueryBuilder['returning'],
    orderBy: jest.fn().mockReturnThis() as MockQueryBuilder['orderBy'],
    select: jest.fn() as MockQueryBuilder['select'],
    first: jest.fn() as MockQueryBuilder['first'],
    update: jest.fn().mockReturnThis() as MockQueryBuilder['update'],
    del: jest.fn() as MockQueryBuilder['del'],
    fn: { now: jest.fn().mockReturnValue('NOW()') as MockQueryBuilder['fn']['now'] },
    transaction: jest.fn() as MockQueryBuilder['transaction'],
  };

  const db = jest.fn().mockReturnValue(builder);
  (db as unknown as { fn: MockQueryBuilder['fn'] }).fn = builder.fn;
  (db as unknown as { transaction: MockQueryBuilder['transaction'] }).transaction = builder.transaction;
  (db as unknown as { raw: (expr: string) => string }).raw = (expr: string) => expr;

  return { db, builder };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('savedChartsService', () => {
  let db: ReturnType<typeof createMockDb>['db'];
  let builder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMockDb();
    db = mocks.db;
    builder = mocks.builder;
  });

  // ── saveChart ─────────────────────────────────────────────────────

  describe('saveChart()', () => {
    it('inserts a chart and returns response', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' }); // count
      builder.first.mockResolvedValueOnce({ max_pos: -1 }); // max position
      builder.first.mockResolvedValueOnce({ max: 0 }); // max grid_y + grid_h
      builder.returning.mockResolvedValue([makeRecord()]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      const result = await service.saveChart(STORE_ID, {
        title: 'Revenue by Product',
        queryText: 'Show revenue by product',
        chartConfig: { type: 'bar', data: { labels: ['A'], datasets: [] } },
      });

      expect(result.id).toBe(CHART_ID);
      expect(result.title).toBe('Revenue by Product');
      expect(result.positionIndex).toBe(0);
    });

    it('throws ValidationError for empty title', async () => {
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.saveChart(STORE_ID, { title: '', chartConfig: { type: 'bar' } }),
      ).rejects.toThrow('Title is required');
    });

    it('throws ValidationError for whitespace-only title', async () => {
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.saveChart(STORE_ID, { title: '   ', chartConfig: { type: 'bar' } }),
      ).rejects.toThrow('Title is required');
    });

    it('throws ValidationError when title exceeds 255 characters', async () => {
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.saveChart(STORE_ID, { title: 'a'.repeat(256), chartConfig: { type: 'bar' } }),
      ).rejects.toThrow('Title must not exceed 255 characters');
    });

    it('throws ValidationError when chartConfig is missing', async () => {
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.saveChart(STORE_ID, { title: 'Test', chartConfig: null as unknown as Record<string, unknown> }),
      ).rejects.toThrow('chartConfig is required');
    });

    it('throws ValidationError when queryText exceeds 2000 characters', async () => {
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.saveChart(STORE_ID, {
          title: 'Test',
          queryText: 'a'.repeat(2001),
          chartConfig: { type: 'bar' },
        }),
      ).rejects.toThrow('queryText must not exceed 2000 characters');
    });

    it('throws ValidationError when max charts reached', async () => {
      builder.first.mockResolvedValueOnce({ count: '20' });

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.saveChart(STORE_ID, { title: 'Test', chartConfig: { type: 'bar' } }),
      ).rejects.toThrow('Maximum of 20 saved charts reached');
    });

    it('sets position_index to max + 1', async () => {
      builder.first.mockResolvedValueOnce({ count: '3' });
      builder.first.mockResolvedValueOnce({ max_pos: 5 });
      builder.first.mockResolvedValueOnce({ max: 20 }); // max grid_y + grid_h
      builder.returning.mockResolvedValue([makeRecord({ position_index: 6 })]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      const result = await service.saveChart(STORE_ID, {
        title: 'Test',
        chartConfig: { type: 'bar' },
      });

      expect(result.positionIndex).toBe(6);
    });

    it('trims title whitespace', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.first.mockResolvedValueOnce({ max_pos: -1 });
      builder.first.mockResolvedValueOnce({ max: 0 }); // max grid_y + grid_h
      builder.returning.mockResolvedValue([makeRecord()]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      await service.saveChart(STORE_ID, {
        title: '  Revenue by Product  ',
        chartConfig: { type: 'bar' },
      });

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Revenue by Product' }),
      );
    });

    it('sets null queryText when not provided', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.first.mockResolvedValueOnce({ max_pos: -1 });
      builder.first.mockResolvedValueOnce({ max: 0 }); // max grid_y + grid_h
      builder.returning.mockResolvedValue([makeRecord({ query_text: null })]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      await service.saveChart(STORE_ID, {
        title: 'Test',
        chartConfig: { type: 'bar' },
      });

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ query_text: null }),
      );
    });

    it('stringifies chartConfig for storage', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      builder.first.mockResolvedValueOnce({ max_pos: -1 });
      builder.first.mockResolvedValueOnce({ max: 0 }); // max grid_y + grid_h
      builder.returning.mockResolvedValue([makeRecord()]);

      const config = { type: 'bar', data: { labels: ['X'] } };
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      await service.saveChart(STORE_ID, {
        title: 'Test',
        chartConfig: config,
      });

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ chart_config: JSON.stringify(config) }),
      );
    });
  });

  // ── listCharts ────────────────────────────────────────────────────

  describe('listCharts()', () => {
    it('returns charts ordered by position_index', async () => {
      builder.select.mockResolvedValue([
        makeRecord({ position_index: 0, title: 'First' }),
        makeRecord({ id: 'chart-2', position_index: 1, title: 'Second' }),
      ]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      const result = await service.listCharts(STORE_ID);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('First');
      expect(result[1].title).toBe('Second');
    });

    it('returns empty array when no charts exist', async () => {
      builder.select.mockResolvedValue([]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      const result = await service.listCharts(STORE_ID);

      expect(result).toEqual([]);
    });

    it('filters by store_id', async () => {
      builder.select.mockResolvedValue([]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      await service.listCharts(STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: STORE_ID });
    });

    it('orders by position_index ascending', async () => {
      builder.select.mockResolvedValue([]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      await service.listCharts(STORE_ID);

      expect(builder.orderBy).toHaveBeenCalledWith('position_index', 'asc');
    });

    it('parses stringified chart_config', async () => {
      builder.select.mockResolvedValue([
        makeRecord({ chart_config: JSON.stringify({ type: 'pie' }) }),
      ]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      const result = await service.listCharts(STORE_ID);

      expect(result[0].chartConfig).toEqual({ type: 'pie' });
    });

    it('handles already-parsed chart_config objects', async () => {
      builder.select.mockResolvedValue([
        makeRecord({ chart_config: { type: 'line' } }),
      ]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      const result = await service.listCharts(STORE_ID);

      expect(result[0].chartConfig).toEqual({ type: 'line' });
    });
  });

  // ── getChart ──────────────────────────────────────────────────────

  describe('getChart()', () => {
    it('returns a single chart by id and store_id', async () => {
      builder.first.mockResolvedValue(makeRecord());

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      const result = await service.getChart(STORE_ID, CHART_ID);

      expect(result.id).toBe(CHART_ID);
      expect(result.title).toBe('Revenue by Product');
    });

    it('throws NotFoundError when chart does not exist', async () => {
      builder.first.mockResolvedValue(undefined);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(service.getChart(STORE_ID, 'nonexistent')).rejects.toThrow('Saved chart not found');
    });

    it('filters by both id and store_id', async () => {
      builder.first.mockResolvedValue(makeRecord());

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      await service.getChart(STORE_ID, CHART_ID);

      expect(builder.where).toHaveBeenCalledWith({ id: CHART_ID, store_id: STORE_ID });
    });
  });

  // ── updateChart ───────────────────────────────────────────────────

  describe('updateChart()', () => {
    it('updates title and returns updated chart', async () => {
      builder.first.mockResolvedValue(makeRecord());
      builder.returning.mockResolvedValue([makeRecord({ title: 'Updated Title' })]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      const result = await service.updateChart(STORE_ID, CHART_ID, { title: 'Updated Title' });

      expect(result.title).toBe('Updated Title');
    });

    it('updates chartConfig', async () => {
      const newConfig = { type: 'pie', data: { labels: ['X'] } };
      builder.first.mockResolvedValue(makeRecord());
      builder.returning.mockResolvedValue([
        makeRecord({ chart_config: JSON.stringify(newConfig) }),
      ]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      const result = await service.updateChart(STORE_ID, CHART_ID, { chartConfig: newConfig });

      expect(result.chartConfig).toEqual(newConfig);
    });

    it('throws NotFoundError when chart does not exist', async () => {
      builder.first.mockResolvedValue(undefined);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.updateChart(STORE_ID, 'nonexistent', { title: 'Test' }),
      ).rejects.toThrow('Saved chart not found');
    });

    it('throws ValidationError for empty title', async () => {
      builder.first.mockResolvedValue(makeRecord());

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.updateChart(STORE_ID, CHART_ID, { title: '' }),
      ).rejects.toThrow('Title cannot be empty');
    });

    it('throws ValidationError when title exceeds 255 characters', async () => {
      builder.first.mockResolvedValue(makeRecord());

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.updateChart(STORE_ID, CHART_ID, { title: 'a'.repeat(256) }),
      ).rejects.toThrow('Title must not exceed 255 characters');
    });

    it('throws ValidationError when chartConfig is not an object', async () => {
      builder.first.mockResolvedValue(makeRecord());

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.updateChart(STORE_ID, CHART_ID, { chartConfig: null as unknown as Record<string, unknown> }),
      ).rejects.toThrow('chartConfig must be an object');
    });

    it('sets updated_at timestamp', async () => {
      builder.first.mockResolvedValue(makeRecord());
      builder.returning.mockResolvedValue([makeRecord()]);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      await service.updateChart(STORE_ID, CHART_ID, { title: 'New' });

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({ updated_at: 'NOW()' }),
      );
    });
  });

  // ── deleteChart ───────────────────────────────────────────────────

  describe('deleteChart()', () => {
    it('deletes a chart by id and store_id', async () => {
      builder.del.mockResolvedValue(1);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      await service.deleteChart(STORE_ID, CHART_ID);

      expect(builder.where).toHaveBeenCalledWith({ id: CHART_ID, store_id: STORE_ID });
      expect(builder.del).toHaveBeenCalled();
    });

    it('throws NotFoundError when chart does not exist', async () => {
      builder.del.mockResolvedValue(0);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(service.deleteChart(STORE_ID, 'nonexistent')).rejects.toThrow('Saved chart not found');
    });
  });

  // ── updateLayout ──────────────────────────────────────────────────

  describe('updateLayout()', () => {
    it('updates position_index for each chart in a transaction', async () => {
      const mockTrx = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      });
      (mockTrx as unknown as { fn: { now: jest.Mock<() => string> } }).fn = {
        now: jest.fn<() => string>().mockReturnValue('NOW()'),
      };
      (mockTrx as unknown as { commit: jest.Mock<() => void> }).commit = jest.fn();
      (mockTrx as unknown as { rollback: jest.Mock<() => void> }).rollback = jest.fn();
      builder.transaction.mockResolvedValue(mockTrx);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });
      await service.updateLayout(STORE_ID, [
        { id: 'chart-1', positionIndex: 0 },
        { id: 'chart-2', positionIndex: 1 },
      ]);

      expect((mockTrx as unknown as { commit: jest.Mock<() => void> }).commit).toHaveBeenCalled();
    });

    it('throws ValidationError for empty positions array', async () => {
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(service.updateLayout(STORE_ID, [])).rejects.toThrow(
        'positions must be a non-empty array',
      );
    });

    it('throws ValidationError for missing id', async () => {
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.updateLayout(STORE_ID, [{ id: '', positionIndex: 0 }]),
      ).rejects.toThrow('Each position must have a valid id');
    });

    it('throws ValidationError for negative positionIndex', async () => {
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.updateLayout(STORE_ID, [{ id: 'chart-1', positionIndex: -1 }]),
      ).rejects.toThrow('Each position must have a non-negative positionIndex');
    });

    it('rolls back transaction on error', async () => {
      const trxUpdate = jest.fn<() => Promise<number>>().mockResolvedValue(0);
      const mockTrx = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: trxUpdate,
      });
      (mockTrx as unknown as { fn: { now: jest.Mock<() => string> } }).fn = {
        now: jest.fn<() => string>().mockReturnValue('NOW()'),
      };
      (mockTrx as unknown as { commit: jest.Mock<() => void> }).commit = jest.fn();
      (mockTrx as unknown as { rollback: jest.Mock<() => void> }).rollback = jest.fn();
      builder.transaction.mockResolvedValue(mockTrx);

      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      await expect(
        service.updateLayout(STORE_ID, [{ id: 'nonexistent', positionIndex: 0 }]),
      ).rejects.toThrow();

      expect((mockTrx as unknown as { rollback: jest.Mock<() => void> }).rollback).toHaveBeenCalled();
    });
  });

  // ── Factory ───────────────────────────────────────────────────────

  describe('createSavedChartsService factory', () => {
    it('returns object with all CRUD methods', () => {
      const service = createSavedChartsService({ db: db as unknown as Parameters<typeof createSavedChartsService>[0]['db'] });

      expect(service).toHaveProperty('saveChart');
      expect(service).toHaveProperty('listCharts');
      expect(service).toHaveProperty('getChart');
      expect(service).toHaveProperty('updateChart');
      expect(service).toHaveProperty('deleteChart');
      expect(service).toHaveProperty('updateLayout');
    });
  });
});
