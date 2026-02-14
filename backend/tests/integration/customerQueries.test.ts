import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * Integration tests for the customer query service.
 *
 * These tests require a running PostgreSQL instance with the woo_ai_readonly
 * user. They verify that:
 * 1. Customer queries execute against real database tables
 * 2. store_id tenant isolation is enforced
 * 3. New vs returning classification works correctly
 * 4. Top customers sort correctly
 * 5. Period-based filtering works
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
const { createCustomerQueries } = await import('../../src/ai/customerQueries.js');

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const READONLY_URL =
  process.env.DATABASE_READONLY_URL ||
  'postgresql://woo_ai_readonly:woo_ai_pass@localhost:5433/woo_ai_analytics';

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const PRIMARY_URL =
  process.env.DATABASE_URL ||
  'postgresql://woo_ai:woo_ai_pass@localhost:5433/woo_ai_analytics';

const TEST_STORE_ID = '550e8400-e29b-41d4-a716-446655440002';
const OTHER_STORE_ID = '660e8400-e29b-41d4-a716-446655440002';

let dbAvailable = false;

describe('Customer queries integration', () => {
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
          store_url: 'https://test-customers.example.com',
          api_key_hash: '$2b$10$test_hash_for_customer_integration_tests',
          is_active: true,
        });
      }

      const otherStoreExists = await primaryDb('stores')
        .where({ id: OTHER_STORE_ID })
        .first();

      if (!otherStoreExists) {
        await primaryDb('stores').insert({
          id: OTHER_STORE_ID,
          store_url: 'https://other-customers.example.com',
          api_key_hash: '$2b$10$test_hash_for_other_customer_tests',
          is_active: true,
        });
      }

      // Clear existing test data for these stores
      await primaryDb('customers')
        .whereIn('store_id', [TEST_STORE_ID, OTHER_STORE_ID])
        .delete();

      // Use fixed dates for deterministic tests
      const today = new Date('2026-06-15T00:00:00Z');
      const lastMonth = new Date('2026-05-15T00:00:00Z');
      const lastYear = new Date('2025-06-15T00:00:00Z');

      // Insert test customers
      // Customer A: New customer (1 order), first order today
      await primaryDb('customers').insert({
        store_id: TEST_STORE_ID,
        wc_customer_id: 3001,
        display_name: 'Alice New',
        total_spent: 150.00,
        order_count: 1,
        first_order_date: today.toISOString(),
        last_order_date: today.toISOString(),
      });

      // Customer B: Returning customer (5 orders), first order last month
      await primaryDb('customers').insert({
        store_id: TEST_STORE_ID,
        wc_customer_id: 3002,
        display_name: 'Bob Returning',
        total_spent: 2500.50,
        order_count: 5,
        first_order_date: lastMonth.toISOString(),
        last_order_date: today.toISOString(),
      });

      // Customer C: Returning customer (3 orders), first order last year
      await primaryDb('customers').insert({
        store_id: TEST_STORE_ID,
        wc_customer_id: 3003,
        display_name: 'Charlie Loyal',
        total_spent: 800.75,
        order_count: 3,
        first_order_date: lastYear.toISOString(),
        last_order_date: lastMonth.toISOString(),
      });

      // Customer D: New customer (1 order), first order last month
      await primaryDb('customers').insert({
        store_id: TEST_STORE_ID,
        wc_customer_id: 3004,
        display_name: 'Diana Recent',
        total_spent: 50.00,
        order_count: 1,
        first_order_date: lastMonth.toISOString(),
        last_order_date: lastMonth.toISOString(),
      });

      // Other store customer (should not appear in test store queries)
      await primaryDb('customers').insert({
        store_id: OTHER_STORE_ID,
        wc_customer_id: 4001,
        display_name: 'Other Store Customer',
        total_spent: 9999.99,
        order_count: 50,
        first_order_date: today.toISOString(),
        last_order_date: today.toISOString(),
      });

      // Create readonly connection
      readonlyDb = createReadonlyDb(READONLY_URL);
      await readonlyDb.raw('SELECT 1');

      dbAvailable = true;
    } catch (error) {
      dbAvailable = false;
      // eslint-disable-next-line no-console
      console.warn('Skipping customer queries integration tests: DB setup failed.', error);
    }
  });

  afterAll(async () => {
    if (primaryDb) {
      try {
        await primaryDb('customers')
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

  describe('newVsReturning', () => {
    it('correctly classifies new and returning customers', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.newVsReturning(TEST_STORE_ID);

      // Alice New (1 order) + Diana Recent (1 order) = 2 new
      // Bob Returning (5 orders) + Charlie Loyal (3 orders) = 2 returning
      expect(result.newCustomers).toBe(2);
      expect(result.returningCustomers).toBe(2);
      expect(result.totalCustomers).toBe(4);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.newVsReturning(OTHER_STORE_ID);

      // Other store has 1 customer with 50 orders (returning)
      expect(result.newCustomers).toBe(0);
      expect(result.returningCustomers).toBe(1);
      expect(result.totalCustomers).toBe(1);
    });

    it('returns zeros for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.newVsReturning('00000000-0000-0000-0000-000000000000');

      expect(result.newCustomers).toBe(0);
      expect(result.returningCustomers).toBe(0);
      expect(result.totalCustomers).toBe(0);
    });
  });

  describe('topCustomersBySpending', () => {
    it('returns customers sorted by total_spent descending', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.topCustomersBySpending(TEST_STORE_ID);

      // Bob Returning: $2500.50, Charlie Loyal: $800.75, Alice New: $150, Diana Recent: $50
      expect(result.length).toBe(4);
      expect(result[0].displayName).toBe('Bob Returning');
      expect(result[0].totalSpent).toBe(2500.5);
      expect(result[1].displayName).toBe('Charlie Loyal');
      expect(result[1].totalSpent).toBe(800.75);
    });

    it('respects limit parameter', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.topCustomersBySpending(TEST_STORE_ID, 2);

      expect(result.length).toBe(2);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.topCustomersBySpending(OTHER_STORE_ID);

      expect(result.length).toBe(1);
      expect(result[0].displayName).toBe('Other Store Customer');
    });

    it('returns empty array for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.topCustomersBySpending('00000000-0000-0000-0000-000000000000');

      expect(result).toEqual([]);
    });
  });

  describe('topCustomersByOrderCount', () => {
    it('returns customers sorted by order_count descending', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.topCustomersByOrderCount(TEST_STORE_ID);

      // Bob Returning: 5, Charlie Loyal: 3, Alice New: 1, Diana Recent: 1
      expect(result.length).toBe(4);
      expect(result[0].displayName).toBe('Bob Returning');
      expect(result[0].orderCount).toBe(5);
      expect(result[1].displayName).toBe('Charlie Loyal');
      expect(result[1].orderCount).toBe(3);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.topCustomersByOrderCount(OTHER_STORE_ID);

      expect(result.length).toBe(1);
      expect(result[0].orderCount).toBe(50);
    });
  });

  describe('newCustomersByPeriod', () => {
    it('counts new customers for this_year', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.newCustomersByPeriod(TEST_STORE_ID, 'this_year');

      // Alice New (2026-06-15) + Bob Returning (2026-05-15) + Diana Recent (2026-05-15) = 3
      // Charlie Loyal (2025-06-15) is excluded since it's last year
      expect(result.count).toBe(3);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.newCustomersByPeriod(OTHER_STORE_ID, 'this_year');

      // Other store has 1 customer whose first order is 2026-06-15
      expect(result.count).toBe(1);
    });

    it('returns 0 for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.newCustomersByPeriod(
        '00000000-0000-0000-0000-000000000000',
        'this_year',
      );

      expect(result.count).toBe(0);
    });
  });

  describe('newCustomersByDateRange', () => {
    it('counts new customers in a wide date range (inclusive end)', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.newCustomersByDateRange(
        TEST_STORE_ID,
        '2020-01-01',
        '2030-01-01',
      );

      // All 4 test store customers (end date is inclusive)
      expect(result.count).toBe(4);
    });

    it('returns 0 for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.newCustomersByDateRange(
        '00000000-0000-0000-0000-000000000000',
        '2020-01-01',
        '2030-01-01',
      );

      expect(result.count).toBe(0);
    });
  });

  describe('customerLifetimeValue', () => {
    it('returns correct averages', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.customerLifetimeValue(TEST_STORE_ID);

      // 4 customers: total_spent = 150 + 2500.50 + 800.75 + 50 = 3501.25
      // avg_total_spent = 3501.25 / 4 = 875.31
      // order_count = 1 + 5 + 3 + 1 = 10, avg = 2.50
      expect(result.totalCustomers).toBe(4);
      expect(result.avgTotalSpent).toBe(875.31);
      expect(result.avgOrderCount).toBe(2.5);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.customerLifetimeValue(OTHER_STORE_ID);

      expect(result.totalCustomers).toBe(1);
      expect(result.avgTotalSpent).toBe(9999.99);
      expect(result.avgOrderCount).toBe(50);
    });

    it('returns zeros for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createCustomerQueries({ readonlyDb });
      const result = await queries.customerLifetimeValue('00000000-0000-0000-0000-000000000000');

      expect(result.totalCustomers).toBe(0);
      expect(result.avgTotalSpent).toBe(0);
      expect(result.avgOrderCount).toBe(0);
    });
  });
});
