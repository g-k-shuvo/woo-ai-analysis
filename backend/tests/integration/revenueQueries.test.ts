import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * Integration tests for the revenue query service.
 *
 * These tests require a running PostgreSQL instance with the woo_ai_readonly
 * user. They verify that:
 * 1. Revenue queries execute against real database tables
 * 2. store_id tenant isolation is enforced
 * 3. Revenue statuses are filtered correctly
 * 4. Date-based queries return expected results
 * 5. Empty result sets are handled gracefully
 *
 * Skipped when DATABASE_READONLY_URL is not set (CI without Postgres).
 */

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createReadonlyDb } = await import('../../src/db/readonlyConnection.js');
const { createRevenueQueries } = await import('../../src/ai/revenueQueries.js');

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const READONLY_URL =
  process.env.DATABASE_READONLY_URL ||
  'postgresql://woo_ai_readonly:woo_ai_pass@localhost:5432/woo_ai_analytics';

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const PRIMARY_URL =
  process.env.DATABASE_URL ||
  'postgresql://woo_ai:woo_ai_pass@localhost:5432/woo_ai_analytics';

const TEST_STORE_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_STORE_ID = '660e8400-e29b-41d4-a716-446655440000';

let dbAvailable = false;

describe('Revenue queries integration', () => {
  let readonlyDb: ReturnType<typeof createReadonlyDb>;
  let primaryDb: ReturnType<typeof createReadonlyDb>;

  beforeAll(async () => {
    try {
      const knexModule = await import('knex');
      const knex = knexModule.default;

      // Set up primary DB for test data
      primaryDb = knex({
        client: 'pg',
        connection: PRIMARY_URL,
        pool: { min: 1, max: 2 },
      });
      await primaryDb.raw('SELECT 1');

      // Ensure the orders table has test data for revenue queries
      // First check if the stores table has our test store
      const storeExists = await primaryDb('stores')
        .where({ id: TEST_STORE_ID })
        .first();

      if (!storeExists) {
        await primaryDb('stores').insert({
          id: TEST_STORE_ID,
          store_url: 'https://test-revenue.example.com',
          api_key_hash: '$2b$10$test_hash_for_revenue_integration_tests',
          is_active: true,
        });
      }

      const otherStoreExists = await primaryDb('stores')
        .where({ id: OTHER_STORE_ID })
        .first();

      if (!otherStoreExists) {
        await primaryDb('stores').insert({
          id: OTHER_STORE_ID,
          store_url: 'https://other-revenue.example.com',
          api_key_hash: '$2b$10$test_hash_for_other_store_tests',
          is_active: true,
        });
      }

      // Clear existing test orders for these stores
      await primaryDb('orders')
        .whereIn('store_id', [TEST_STORE_ID, OTHER_STORE_ID])
        .delete();

      // Insert test orders with known values
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      await primaryDb('orders').insert([
        // Today's orders — completed
        {
          store_id: TEST_STORE_ID,
          wc_order_id: 9001,
          date_created: today.toISOString(),
          status: 'completed',
          total: 100.00,
          subtotal: 90.00,
          tax_total: 10.00,
          currency: 'USD',
        },
        {
          store_id: TEST_STORE_ID,
          wc_order_id: 9002,
          date_created: today.toISOString(),
          status: 'processing',
          total: 200.00,
          subtotal: 180.00,
          tax_total: 20.00,
          currency: 'USD',
        },
        // Today's order — cancelled (should not count in revenue)
        {
          store_id: TEST_STORE_ID,
          wc_order_id: 9003,
          date_created: today.toISOString(),
          status: 'cancelled',
          total: 50.00,
          subtotal: 45.00,
          tax_total: 5.00,
          currency: 'USD',
        },
        // Yesterday's order
        {
          store_id: TEST_STORE_ID,
          wc_order_id: 9004,
          date_created: yesterday.toISOString(),
          status: 'completed',
          total: 75.50,
          subtotal: 70.00,
          tax_total: 5.50,
          currency: 'USD',
        },
        // Last week's order
        {
          store_id: TEST_STORE_ID,
          wc_order_id: 9005,
          date_created: lastWeek.toISOString(),
          status: 'completed',
          total: 500.00,
          subtotal: 450.00,
          tax_total: 50.00,
          currency: 'USD',
        },
        // Other store's order (should not appear)
        {
          store_id: OTHER_STORE_ID,
          wc_order_id: 9006,
          date_created: today.toISOString(),
          status: 'completed',
          total: 999.99,
          subtotal: 900.00,
          tax_total: 99.99,
          currency: 'EUR',
        },
      ]);

      // Create readonly connection
      readonlyDb = createReadonlyDb(READONLY_URL);
      await readonlyDb.raw('SELECT 1');

      dbAvailable = true;
    } catch (error) {
      dbAvailable = false;
      // eslint-disable-next-line no-console
      console.warn('Skipping revenue queries integration tests: DB setup failed.', error);
    }
  });

  afterAll(async () => {
    if (primaryDb) {
      try {
        await primaryDb('orders')
          .whereIn('store_id', [TEST_STORE_ID, OTHER_STORE_ID])
          .delete();
        await primaryDb('stores')
          .whereIn('id', [TEST_STORE_ID, OTHER_STORE_ID])
          .delete();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Failed to clean up test data:', error);
      }
      await primaryDb.destroy();
    }
    if (readonlyDb) {
      await readonlyDb.destroy();
    }
  });

  describe('totalRevenue', () => {
    it('returns total revenue from completed and processing orders only', async () => {
      if (!dbAvailable) return;

      const queries = createRevenueQueries({ readonlyDb });
      const result = await queries.totalRevenue(TEST_STORE_ID);

      // Should include: 100 + 200 + 75.50 + 500 = 875.50
      // Should exclude: 50 (cancelled) and 999.99 (other store)
      expect(result.revenue).toBe(875.5);
      expect(result.orderCount).toBe(4);
      expect(result.avgOrderValue).toBeGreaterThan(0);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createRevenueQueries({ readonlyDb });
      const result = await queries.totalRevenue(OTHER_STORE_ID);

      expect(result.revenue).toBe(999.99);
      expect(result.orderCount).toBe(1);
    });

    it('returns zeros for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createRevenueQueries({ readonlyDb });
      const result = await queries.totalRevenue('00000000-0000-0000-0000-000000000000');

      expect(result.revenue).toBe(0);
      expect(result.orderCount).toBe(0);
      expect(result.avgOrderValue).toBe(0);
    });
  });

  describe('revenueByPeriod', () => {
    it('returns revenue for last_7_days', async () => {
      if (!dbAvailable) return;

      const queries = createRevenueQueries({ readonlyDb });
      const result = await queries.revenueByPeriod(TEST_STORE_ID, 'last_7_days');

      // Should include today's and yesterday's orders (100 + 200 + 75.50 = 375.50)
      // May or may not include last week's depending on exact timing
      expect(result.revenue).toBeGreaterThanOrEqual(375.5);
      expect(result.orderCount).toBeGreaterThanOrEqual(3);
    });

    it('returns revenue for last_30_days', async () => {
      if (!dbAvailable) return;

      const queries = createRevenueQueries({ readonlyDb });
      const result = await queries.revenueByPeriod(TEST_STORE_ID, 'last_30_days');

      // Should include all test orders (100 + 200 + 75.50 + 500 = 875.50)
      expect(result.revenue).toBe(875.5);
      expect(result.orderCount).toBe(4);
    });
  });

  describe('revenueByDateRange', () => {
    it('returns revenue for a specific date range', async () => {
      if (!dbAvailable) return;

      const queries = createRevenueQueries({ readonlyDb });
      // Use a wide range that covers all test data
      const result = await queries.revenueByDateRange(
        TEST_STORE_ID,
        '2020-01-01',
        '2030-01-01',
      );

      expect(result.revenue).toBe(875.5);
      expect(result.orderCount).toBe(4);
    });
  });

  describe('revenueComparison', () => {
    it('returns comparison with trend direction', async () => {
      if (!dbAvailable) return;

      const queries = createRevenueQueries({ readonlyDb });
      const result = await queries.revenueComparison(TEST_STORE_ID, 'last_30_days');

      // Current period has data, so should have a valid comparison structure
      expect(result.current).toBeDefined();
      expect(result.previous).toBeDefined();
      expect(typeof result.revenueChange).toBe('number');
      expect(typeof result.revenueChangePercent).toBe('number');
      expect(['up', 'down', 'flat']).toContain(result.trend);
    });
  });

  describe('revenueBreakdown', () => {
    it('returns daily breakdown rows', async () => {
      if (!dbAvailable) return;

      const queries = createRevenueQueries({ readonlyDb });
      const result = await queries.revenueBreakdown(TEST_STORE_ID, 'day', 30);

      // Should have at least 2 distinct days (today and yesterday/last week)
      expect(result.rows.length).toBeGreaterThanOrEqual(2);
      expect(result.total).toBe(875.5);

      // Each row should have the expected structure
      for (const row of result.rows) {
        expect(typeof row.period).toBe('string');
        expect(typeof row.revenue).toBe('number');
        expect(typeof row.orderCount).toBe('number');
        expect(row.revenue).toBeGreaterThan(0);
        expect(row.orderCount).toBeGreaterThan(0);
      }
    });

    it('returns empty breakdown for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createRevenueQueries({ readonlyDb });
      const result = await queries.revenueBreakdown(
        '00000000-0000-0000-0000-000000000000',
        'day',
        7,
      );

      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
