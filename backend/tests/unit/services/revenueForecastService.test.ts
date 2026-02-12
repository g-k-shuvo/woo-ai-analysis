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

const { createRevenueForecastService } = await import(
  '../../../src/services/revenueForecastService.js'
);

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const FORECAST_ID = 'ffff0000-1111-2222-3333-444455556666';

function makeForecastRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: FORECAST_ID,
    store_id: STORE_ID,
    days_ahead: 30,
    historical_days: 90,
    data_points: JSON.stringify([
      { date: '2026-02-13', predicted: 1250.5, type: 'forecast' },
      { date: '2026-02-14', predicted: 1275.0, type: 'forecast' },
    ]),
    summary: JSON.stringify({
      avgDailyRevenue: 1200.0,
      projectedTotal: 37500.0,
      trend: 'up',
    }),
    created_at: '2026-02-12T10:00:00.000Z',
    ...overrides,
  };
}

function makeDailyRevenueRows(count: number, startRevenue = 100) {
  const rows = [];
  const baseDate = new Date('2025-11-15');
  for (let i = 0; i < count; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() + i);
    rows.push({
      day: d.toISOString().split('T')[0],
      revenue: String(startRevenue + i * 10),
    });
  }
  return rows;
}

// ── Mock Knex builder ───────────────────────────────────────────────

interface MockQueryBuilder {
  where: jest.Mock<() => MockQueryBuilder>;
  whereIn: jest.Mock<() => MockQueryBuilder>;
  orderBy: jest.Mock<() => MockQueryBuilder>;
  count: jest.Mock<() => MockQueryBuilder>;
  select: jest.Mock<() => Promise<unknown[]>>;
  first: jest.Mock<() => Promise<unknown>>;
  insert: jest.Mock<() => MockQueryBuilder>;
  del: jest.Mock<() => Promise<number>>;
  returning: jest.Mock<() => Promise<unknown[]>>;
  groupByRaw: jest.Mock<() => MockQueryBuilder>;
  raw: jest.Mock<() => unknown>;
}

function createMockDb() {
  const builder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis() as MockQueryBuilder['where'],
    whereIn: jest.fn().mockReturnThis() as MockQueryBuilder['whereIn'],
    orderBy: jest.fn().mockReturnThis() as MockQueryBuilder['orderBy'],
    count: jest.fn().mockReturnThis() as MockQueryBuilder['count'],
    select: jest.fn() as MockQueryBuilder['select'],
    first: jest.fn() as MockQueryBuilder['first'],
    insert: jest.fn().mockReturnThis() as MockQueryBuilder['insert'],
    del: jest.fn() as MockQueryBuilder['del'],
    returning: jest.fn() as MockQueryBuilder['returning'],
    groupByRaw: jest.fn().mockReturnThis() as MockQueryBuilder['groupByRaw'],
    raw: jest.fn((sql: string) => sql) as MockQueryBuilder['raw'],
  };

  const db = jest.fn().mockReturnValue(builder) as unknown as jest.Mock & {
    raw: jest.Mock<() => unknown>;
  };
  (db as unknown as Record<string, unknown>).raw = jest.fn((sql: string) => sql);

  return { db, builder };
}

function createMockReadonlyDb() {
  const roBuilder: MockQueryBuilder = {
    where: jest.fn().mockReturnThis() as MockQueryBuilder['where'],
    whereIn: jest.fn().mockReturnThis() as MockQueryBuilder['whereIn'],
    orderBy: jest.fn().mockReturnThis() as MockQueryBuilder['orderBy'],
    count: jest.fn().mockReturnThis() as MockQueryBuilder['count'],
    select: jest.fn() as MockQueryBuilder['select'],
    first: jest.fn() as MockQueryBuilder['first'],
    insert: jest.fn().mockReturnThis() as MockQueryBuilder['insert'],
    del: jest.fn() as MockQueryBuilder['del'],
    returning: jest.fn() as MockQueryBuilder['returning'],
    groupByRaw: jest.fn().mockReturnThis() as MockQueryBuilder['groupByRaw'],
    raw: jest.fn((sql: string) => sql) as MockQueryBuilder['raw'],
  };

  const readonlyDb = jest.fn().mockReturnValue(roBuilder) as unknown as jest.Mock & {
    raw: jest.Mock<() => unknown>;
  };
  (readonlyDb as unknown as Record<string, unknown>).raw = jest.fn((sql: string) => sql);

  return { readonlyDb, roBuilder };
}

type ServiceDeps = Parameters<typeof createRevenueForecastService>[0];

// ── Tests ───────────────────────────────────────────────────────────

describe('revenueForecastService', () => {
  let db: ReturnType<typeof createMockDb>['db'];
  let builder: MockQueryBuilder;
  let readonlyDb: ReturnType<typeof createMockReadonlyDb>['readonlyDb'];
  let roBuilder: MockQueryBuilder;

  beforeEach(() => {
    jest.clearAllMocks();
    const dbMocks = createMockDb();
    db = dbMocks.db;
    builder = dbMocks.builder;
    const roMocks = createMockReadonlyDb();
    readonlyDb = roMocks.readonlyDb;
    roBuilder = roMocks.roBuilder;
  });

  function makeService() {
    return createRevenueForecastService({
      db: db as unknown as ServiceDeps['db'],
      readonlyDb: readonlyDb as unknown as ServiceDeps['readonlyDb'],
    });
  }

  // ── generateForecast ────────────────────────────────────────────

  describe('generateForecast()', () => {
    it('generates a forecast and returns response', async () => {
      // count check
      builder.first.mockResolvedValueOnce({ count: '0' });
      // daily revenue query
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(30));
      // insert
      builder.returning.mockResolvedValueOnce([makeForecastRecord()]);

      const service = makeService();
      const result = await service.generateForecast(STORE_ID, { daysAhead: 30 });

      expect(result.id).toBe(FORECAST_ID);
      expect(result.daysAhead).toBe(30);
      expect(result.historicalDays).toBe(90);
      expect(result.dataPoints).toHaveLength(2);
      expect(result.summary.trend).toBe('up');
      expect(result.createdAt).toBe('2026-02-12T10:00:00.000Z');
    });

    it('throws ValidationError for invalid daysAhead', async () => {
      const service = makeService();

      await expect(
        service.generateForecast(STORE_ID, { daysAhead: 5 }),
      ).rejects.toThrow('daysAhead must be 7, 14, or 30');
    });

    it('throws ValidationError for daysAhead=0', async () => {
      const service = makeService();

      await expect(
        service.generateForecast(STORE_ID, { daysAhead: 0 }),
      ).rejects.toThrow('daysAhead must be 7, 14, or 30');
    });

    it('throws ValidationError for daysAhead=60', async () => {
      const service = makeService();

      await expect(
        service.generateForecast(STORE_ID, { daysAhead: 60 }),
      ).rejects.toThrow('daysAhead must be 7, 14, or 30');
    });

    it('accepts daysAhead=7', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([
        makeForecastRecord({ days_ahead: 7 }),
      ]);

      const service = makeService();
      const result = await service.generateForecast(STORE_ID, { daysAhead: 7 });

      expect(result.daysAhead).toBe(7);
    });

    it('accepts daysAhead=14', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([
        makeForecastRecord({ days_ahead: 14 }),
      ]);

      const service = makeService();
      const result = await service.generateForecast(STORE_ID, { daysAhead: 14 });

      expect(result.daysAhead).toBe(14);
    });

    it('throws ValidationError when max forecasts reached', async () => {
      builder.first.mockResolvedValueOnce({ count: '10' });

      const service = makeService();

      await expect(
        service.generateForecast(STORE_ID, { daysAhead: 30 }),
      ).rejects.toThrow('Maximum of 10 forecasts allowed per store');
    });

    it('throws ValidationError when insufficient historical data', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(3));

      const service = makeService();

      await expect(
        service.generateForecast(STORE_ID, { daysAhead: 30 }),
      ).rejects.toThrow('At least 7 days of order history required');
    });

    it('throws ValidationError when no historical data', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce([]);

      const service = makeService();

      await expect(
        service.generateForecast(STORE_ID, { daysAhead: 30 }),
      ).rejects.toThrow('At least 7 days of order history required');
    });

    it('filters orders by store_id', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([makeForecastRecord()]);

      const service = makeService();
      await service.generateForecast(STORE_ID, { daysAhead: 30 });

      expect(roBuilder.where).toHaveBeenCalledWith({ store_id: STORE_ID });
    });

    it('filters by completed and processing order statuses', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([makeForecastRecord()]);

      const service = makeService();
      await service.generateForecast(STORE_ID, { daysAhead: 30 });

      expect(roBuilder.whereIn).toHaveBeenCalledWith('status', [
        'completed',
        'processing',
      ]);
    });

    it('inserts with correct store_id', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([makeForecastRecord()]);

      const service = makeService();
      await service.generateForecast(STORE_ID, { daysAhead: 30 });

      expect(builder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          store_id: STORE_ID,
          days_ahead: 30,
        }),
      );
    });

    it('logs on successful generation', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([makeForecastRecord()]);

      const { logger: mockLogger } = await import('../../../src/utils/logger.js');

      const service = makeService();
      await service.generateForecast(STORE_ID, { daysAhead: 30 });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: STORE_ID, forecastId: FORECAST_ID }),
        'Revenue forecast generated',
      );
    });

    it('checks max forecast count with store_id filter', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([makeForecastRecord()]);

      const service = makeService();
      await service.generateForecast(STORE_ID, { daysAhead: 30 });

      // First call to builder.where should be the count check with store_id
      expect(builder.where).toHaveBeenCalledWith({ store_id: STORE_ID });
    });

    it('stores data_points and summary as JSON strings', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([makeForecastRecord()]);

      const service = makeService();
      await service.generateForecast(STORE_ID, { daysAhead: 30 });

      const insertCall = (builder.insert.mock.calls as unknown[][])[0][0] as Record<string, unknown>;
      expect(typeof insertCall.data_points).toBe('string');
      expect(typeof insertCall.summary).toBe('string');
    });

    it('parses JSON data_points from string', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([makeForecastRecord()]);

      const service = makeService();
      const result = await service.generateForecast(STORE_ID, { daysAhead: 30 });

      expect(Array.isArray(result.dataPoints)).toBe(true);
      expect(result.dataPoints[0].date).toBe('2026-02-13');
    });

    it('parses JSON summary from string', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([makeForecastRecord()]);

      const service = makeService();
      const result = await service.generateForecast(STORE_ID, { daysAhead: 30 });

      expect(result.summary.avgDailyRevenue).toBe(1200.0);
      expect(result.summary.projectedTotal).toBe(37500.0);
    });

    it('handles data_points already as object (not string)', async () => {
      builder.first.mockResolvedValueOnce({ count: '0' });
      roBuilder.select.mockResolvedValueOnce(makeDailyRevenueRows(10));
      builder.returning.mockResolvedValueOnce([
        makeForecastRecord({
          data_points: [{ date: '2026-02-13', predicted: 100, type: 'forecast' }],
          summary: { avgDailyRevenue: 100, projectedTotal: 700, trend: 'flat' },
        }),
      ]);

      const service = makeService();
      const result = await service.generateForecast(STORE_ID, { daysAhead: 30 });

      expect(result.dataPoints[0].date).toBe('2026-02-13');
      expect(result.summary.trend).toBe('flat');
    });
  });

  // ── listForecasts ─────────────────────────────────────────────────

  describe('listForecasts()', () => {
    it('returns all forecasts for a store', async () => {
      builder.select.mockResolvedValueOnce([
        makeForecastRecord(),
        makeForecastRecord({ id: 'forecast-2', days_ahead: 7 }),
      ]);

      const service = makeService();
      const results = await service.listForecasts(STORE_ID);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe(FORECAST_ID);
      expect(results[1].id).toBe('forecast-2');
    });

    it('returns empty array when no forecasts', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = makeService();
      const results = await service.listForecasts(STORE_ID);

      expect(results).toEqual([]);
    });

    it('filters by store_id', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = makeService();
      await service.listForecasts(STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({ store_id: STORE_ID });
    });

    it('orders by created_at desc', async () => {
      builder.select.mockResolvedValueOnce([]);

      const service = makeService();
      await service.listForecasts(STORE_ID);

      expect(builder.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('maps record fields to camelCase response', async () => {
      builder.select.mockResolvedValueOnce([
        makeForecastRecord({
          days_ahead: 14,
          historical_days: 60,
        }),
      ]);

      const service = makeService();
      const results = await service.listForecasts(STORE_ID);

      expect(results[0].daysAhead).toBe(14);
      expect(results[0].historicalDays).toBe(60);
    });
  });

  // ── getForecast ───────────────────────────────────────────────────

  describe('getForecast()', () => {
    it('returns a single forecast', async () => {
      builder.first.mockResolvedValueOnce(makeForecastRecord());

      const service = makeService();
      const result = await service.getForecast(STORE_ID, FORECAST_ID);

      expect(result.id).toBe(FORECAST_ID);
      expect(result.daysAhead).toBe(30);
    });

    it('throws NotFoundError when forecast does not exist', async () => {
      builder.first.mockResolvedValueOnce(undefined);

      const service = makeService();

      await expect(
        service.getForecast(STORE_ID, 'nonexistent'),
      ).rejects.toThrow('Forecast not found');
    });

    it('filters by both id and store_id', async () => {
      builder.first.mockResolvedValueOnce(makeForecastRecord());

      const service = makeService();
      await service.getForecast(STORE_ID, FORECAST_ID);

      expect(builder.where).toHaveBeenCalledWith({
        id: FORECAST_ID,
        store_id: STORE_ID,
      });
    });
  });

  // ── deleteForecast ────────────────────────────────────────────────

  describe('deleteForecast()', () => {
    it('deletes a forecast and returns void', async () => {
      builder.del.mockResolvedValueOnce(1);

      const service = makeService();

      await expect(
        service.deleteForecast(STORE_ID, FORECAST_ID),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundError when forecast does not exist', async () => {
      builder.del.mockResolvedValueOnce(0);

      const service = makeService();

      await expect(
        service.deleteForecast(STORE_ID, 'nonexistent'),
      ).rejects.toThrow('Forecast not found');
    });

    it('filters by both id and store_id', async () => {
      builder.del.mockResolvedValueOnce(1);

      const service = makeService();
      await service.deleteForecast(STORE_ID, FORECAST_ID);

      expect(builder.where).toHaveBeenCalledWith({
        id: FORECAST_ID,
        store_id: STORE_ID,
      });
    });

    it('logs on successful deletion', async () => {
      builder.del.mockResolvedValueOnce(1);

      const { logger: mockLogger } = await import('../../../src/utils/logger.js');

      const service = makeService();
      await service.deleteForecast(STORE_ID, FORECAST_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: STORE_ID, forecastId: FORECAST_ID }),
        'Revenue forecast deleted',
      );
    });
  });

  // ── Factory ───────────────────────────────────────────────────────

  describe('createRevenueForecastService factory', () => {
    it('returns object with all methods', () => {
      const service = makeService();

      expect(service).toHaveProperty('generateForecast');
      expect(service).toHaveProperty('listForecasts');
      expect(service).toHaveProperty('getForecast');
      expect(service).toHaveProperty('deleteForecast');
      expect(typeof service.generateForecast).toBe('function');
      expect(typeof service.listForecasts).toBe('function');
      expect(typeof service.getForecast).toBe('function');
      expect(typeof service.deleteForecast).toBe('function');
    });
  });
});
