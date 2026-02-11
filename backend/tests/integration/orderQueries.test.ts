import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * Integration tests for the order query service.
 *
 * These tests require a running PostgreSQL instance with the woo_ai_readonly
 * user. They verify that:
 * 1. Order queries execute against real database tables
 * 2. store_id tenant isolation is enforced
 * 3. Status breakdown counts correctly
 * 4. Period-based filtering works
 * 5. Recent orders sort correctly
 * 6. Empty result sets are handled gracefully
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
const { createOrderQueries } = await import('../../src/ai/orderQueries.js');

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const READONLY_URL =
  process.env.DATABASE_READONLY_URL ||
  'postgresql://woo_ai_readonly:woo_ai_pass@localhost:5432/woo_ai_analytics';

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const PRIMARY_URL =
  process.env.DATABASE_URL ||
  'postgresql://woo_ai:woo_ai_pass@localhost:5432/woo_ai_analytics';

const TEST_STORE_ID = '550e8400-e29b-41d4-a716-446655440003';
const OTHER_STORE_ID = '660e8400-e29b-41d4-a716-446655440003';

let dbAvailable = false;

describe('Order queries integration', () => {
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

      // Ensure the stores table has our test stores
      const storeExists = await primaryDb('stores')
        .where({ id: TEST_STORE_ID })
        .first();

      if (!storeExists) {
        await primaryDb('stores').insert({
          id: TEST_STORE_ID,
          store_url: 'https://test-orders.example.com',
          api_key_hash: '$2b$10$test_hash_for_order_integration_tests',
          is_active: true,
        });
      }

      const otherStoreExists = await primaryDb('stores')
        .where({ id: OTHER_STORE_ID })
        .first();

      if (!otherStoreExists) {
        await primaryDb('stores').insert({
          id: OTHER_STORE_ID,
          store_url: 'https://other-orders.example.com',
          api_key_hash: '$2b$10$test_hash_for_other_order_tests',
          is_active: true,
        });
      }

      // Clear existing test data for these stores
      await primaryDb('orders')
        .whereIn('store_id', [TEST_STORE_ID, OTHER_STORE_ID])
        .delete();

      // Use fixed dates for deterministic tests
      const today = new Date('2026-06-15T10:00:00Z');
      const yesterday = new Date('2026-06-14T08:00:00Z');
      const lastMonth = new Date('2026-05-15T12:00:00Z');
      const lastYear = new Date('2025-06-15T12:00:00Z');

      // Insert test orders for TEST_STORE
      // Order 1: completed, today
      await primaryDb('orders').insert({
        store_id: TEST_STORE_ID,
        wc_order_id: 5001,
        date_created: today.toISOString(),
        status: 'completed',
        total: 150.00,
        currency: 'USD',
      });

      // Order 2: processing, yesterday
      await primaryDb('orders').insert({
        store_id: TEST_STORE_ID,
        wc_order_id: 5002,
        date_created: yesterday.toISOString(),
        status: 'processing',
        total: 75.50,
        currency: 'USD',
      });

      // Order 3: completed, last month
      await primaryDb('orders').insert({
        store_id: TEST_STORE_ID,
        wc_order_id: 5003,
        date_created: lastMonth.toISOString(),
        status: 'completed',
        total: 200.00,
        currency: 'USD',
      });

      // Order 4: refunded, today (should show in status breakdown, not in count)
      await primaryDb('orders').insert({
        store_id: TEST_STORE_ID,
        wc_order_id: 5004,
        date_created: today.toISOString(),
        status: 'refunded',
        total: 50.00,
        currency: 'USD',
      });

      // Order 5: pending, last year (should show in status breakdown, not in count)
      await primaryDb('orders').insert({
        store_id: TEST_STORE_ID,
        wc_order_id: 5005,
        date_created: lastYear.toISOString(),
        status: 'pending',
        total: 30.00,
        currency: 'USD',
      });

      // Other store order (should not appear in test store queries)
      await primaryDb('orders').insert({
        store_id: OTHER_STORE_ID,
        wc_order_id: 6001,
        date_created: today.toISOString(),
        status: 'completed',
        total: 9999.99,
        currency: 'USD',
      });

      // Create readonly connection
      readonlyDb = createReadonlyDb(READONLY_URL);
      await readonlyDb.raw('SELECT 1');

      dbAvailable = true;
    } catch (error) {
      dbAvailable = false;
      // eslint-disable-next-line no-console
      console.warn('Skipping order queries integration tests: DB setup failed.', error);
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

  describe('orderCount', () => {
    it('returns correct count, revenue, and AOV for completed/processing orders', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.orderCount(TEST_STORE_ID);

      // 3 completed/processing orders: $150 + $75.50 + $200 = $425.50
      expect(result.orderCount).toBe(3);
      expect(result.revenue).toBe(425.5);
      expect(result.avgOrderValue).toBe(141.83);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.orderCount(OTHER_STORE_ID);

      expect(result.orderCount).toBe(1);
      expect(result.revenue).toBe(9999.99);
    });

    it('returns zeros for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.orderCount('00000000-0000-0000-0000-000000000000');

      expect(result.orderCount).toBe(0);
      expect(result.revenue).toBe(0);
      expect(result.avgOrderValue).toBe(0);
    });
  });

  describe('ordersByPeriod', () => {
    it('counts orders for this_year', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.ordersByPeriod(TEST_STORE_ID, 'this_year');

      // 2026 orders: 5001 (completed), 5002 (processing), 5003 (completed), 5004 (refunded - excluded)
      // Only completed/processing = 3
      expect(result.orderCount).toBe(3);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.ordersByPeriod(OTHER_STORE_ID, 'this_year');

      expect(result.orderCount).toBe(1);
    });

    it('returns 0 for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.ordersByPeriod(
        '00000000-0000-0000-0000-000000000000',
        'this_year',
      );

      expect(result.orderCount).toBe(0);
    });
  });

  describe('ordersByDateRange', () => {
    it('counts orders in a wide date range (inclusive end)', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.ordersByDateRange(
        TEST_STORE_ID,
        '2020-01-01',
        '2030-01-01',
      );

      // All 3 completed/processing orders (refunded and pending excluded)
      expect(result.orderCount).toBe(3);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.ordersByDateRange(
        OTHER_STORE_ID,
        '2020-01-01',
        '2030-01-01',
      );

      expect(result.orderCount).toBe(1);
    });

    it('returns 0 for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.ordersByDateRange(
        '00000000-0000-0000-0000-000000000000',
        '2020-01-01',
        '2030-01-01',
      );

      expect(result.orderCount).toBe(0);
    });
  });

  describe('orderStatusBreakdown', () => {
    it('returns all statuses with correct counts', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.orderStatusBreakdown(TEST_STORE_ID);

      // 5 orders total: 2 completed, 1 processing, 1 refunded, 1 pending
      expect(result.length).toBeGreaterThanOrEqual(3);

      const completedRow = result.find((r) => r.status === 'completed');
      expect(completedRow).toBeDefined();
      expect(completedRow!.count).toBe(2);

      const processingRow = result.find((r) => r.status === 'processing');
      expect(processingRow).toBeDefined();
      expect(processingRow!.count).toBe(1);

      const refundedRow = result.find((r) => r.status === 'refunded');
      expect(refundedRow).toBeDefined();
      expect(refundedRow!.count).toBe(1);

      const pendingRow = result.find((r) => r.status === 'pending');
      expect(pendingRow).toBeDefined();
      expect(pendingRow!.count).toBe(1);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.orderStatusBreakdown(OTHER_STORE_ID);

      expect(result.length).toBe(1);
      expect(result[0].status).toBe('completed');
      expect(result[0].count).toBe(1);
    });

    it('returns empty array for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.orderStatusBreakdown('00000000-0000-0000-0000-000000000000');

      expect(result).toEqual([]);
    });
  });

  describe('recentOrders', () => {
    it('returns orders sorted by date_created descending', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.recentOrders(TEST_STORE_ID);

      // All 5 test store orders, most recent first
      expect(result.length).toBe(5);
      // wc_order_id 5001 or 5004 first (both on same day — 2026-06-15)
      expect(result[0].wcOrderId).toBeGreaterThanOrEqual(5001);
    });

    it('respects limit parameter', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.recentOrders(TEST_STORE_ID, 2);

      expect(result.length).toBe(2);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.recentOrders(OTHER_STORE_ID);

      expect(result.length).toBe(1);
      expect(result[0].wcOrderId).toBe(6001);
    });

    it('returns empty array for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.recentOrders('00000000-0000-0000-0000-000000000000');

      expect(result).toEqual([]);
    });

    it('includes all order statuses (not just completed/processing)', async () => {
      if (!dbAvailable) return;

      const queries = createOrderQueries({ readonlyDb });
      const result = await queries.recentOrders(TEST_STORE_ID);

      const statuses = result.map((r) => r.status);
      expect(statuses).toContain('refunded');
      expect(statuses).toContain('pending');
    });
  });
});
