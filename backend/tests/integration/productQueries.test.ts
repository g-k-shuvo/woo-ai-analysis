import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * Integration tests for the product query service.
 *
 * These tests require a running PostgreSQL instance with the woo_ai_readonly
 * user. They verify that:
 * 1. Product queries execute against real database tables
 * 2. store_id tenant isolation is enforced
 * 3. Order statuses are filtered correctly
 * 4. JOINs between orders, order_items, and products work correctly
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
const { createProductQueries } = await import('../../src/ai/productQueries.js');

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const READONLY_URL =
  process.env.DATABASE_READONLY_URL ||
  'postgresql://woo_ai_readonly:woo_ai_pass@localhost:5433/woo_ai_analytics';

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const PRIMARY_URL =
  process.env.DATABASE_URL ||
  'postgresql://woo_ai:woo_ai_pass@localhost:5433/woo_ai_analytics';

const TEST_STORE_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_STORE_ID = '660e8400-e29b-41d4-a716-446655440001';

let dbAvailable = false;

describe('Product queries integration', () => {
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
          store_url: 'https://test-products.example.com',
          api_key_hash: '$2b$10$test_hash_for_product_integration_tests',
          is_active: true,
        });
      }

      const otherStoreExists = await primaryDb('stores')
        .where({ id: OTHER_STORE_ID })
        .first();

      if (!otherStoreExists) {
        await primaryDb('stores').insert({
          id: OTHER_STORE_ID,
          store_url: 'https://other-products.example.com',
          api_key_hash: '$2b$10$test_hash_for_other_product_tests',
          is_active: true,
        });
      }

      // Clear existing test data for these stores
      await primaryDb('order_items')
        .whereIn('store_id', [TEST_STORE_ID, OTHER_STORE_ID])
        .delete();
      await primaryDb('orders')
        .whereIn('store_id', [TEST_STORE_ID, OTHER_STORE_ID])
        .delete();
      await primaryDb('products')
        .whereIn('store_id', [TEST_STORE_ID, OTHER_STORE_ID])
        .delete();

      // Insert test products
      const [productA] = await primaryDb('products')
        .insert({
          store_id: TEST_STORE_ID,
          wc_product_id: 1001,
          name: 'Widget Alpha',
          sku: 'WA-001',
          price: 25.00,
          category_name: 'Electronics',
          stock_quantity: 50,
          stock_status: 'instock',
          status: 'publish',
        })
        .returning('id');

      const [productB] = await primaryDb('products')
        .insert({
          store_id: TEST_STORE_ID,
          wc_product_id: 1002,
          name: 'Widget Beta',
          sku: 'WB-001',
          price: 75.00,
          category_name: 'Electronics',
          stock_quantity: 3,
          stock_status: 'instock',
          status: 'publish',
        })
        .returning('id');

      await primaryDb('products').insert({
        store_id: TEST_STORE_ID,
        wc_product_id: 1003,
        name: 'Gadget Gamma',
        sku: 'GG-001',
        price: 150.00,
        category_name: 'Gadgets',
        stock_quantity: 0,
        stock_status: 'outofstock',
        status: 'publish',
      });

      const [productD] = await primaryDb('products')
        .insert({
          store_id: TEST_STORE_ID,
          wc_product_id: 1004,
          name: 'Low Stock Widget',
          sku: 'LSW-001',
          price: 10.00,
          category_name: 'Accessories',
          stock_quantity: 2,
          stock_status: 'instock',
          status: 'publish',
        })
        .returning('id');

      // Other store product (should not appear in test store queries)
      await primaryDb('products').insert({
        store_id: OTHER_STORE_ID,
        wc_product_id: 2001,
        name: 'Other Store Product',
        sku: 'OSP-001',
        price: 999.00,
        category_name: 'Other',
        stock_quantity: 100,
        stock_status: 'instock',
        status: 'publish',
      });

      const productAId = typeof productA === 'object' ? productA.id : productA;
      const productBId = typeof productB === 'object' ? productB.id : productB;
      const productDId = typeof productD === 'object' ? productD.id : productD;

      // Insert test orders
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [order1] = await primaryDb('orders')
        .insert({
          store_id: TEST_STORE_ID,
          wc_order_id: 8001,
          date_created: today.toISOString(),
          status: 'completed',
          total: 125.00,
          currency: 'USD',
        })
        .returning('id');

      const [order2] = await primaryDb('orders')
        .insert({
          store_id: TEST_STORE_ID,
          wc_order_id: 8002,
          date_created: today.toISOString(),
          status: 'processing',
          total: 75.00,
          currency: 'USD',
        })
        .returning('id');

      const [order3] = await primaryDb('orders')
        .insert({
          store_id: TEST_STORE_ID,
          wc_order_id: 8003,
          date_created: today.toISOString(),
          status: 'cancelled',
          total: 200.00,
          currency: 'USD',
        })
        .returning('id');

      const [order4] = await primaryDb('orders')
        .insert({
          store_id: TEST_STORE_ID,
          wc_order_id: 8004,
          date_created: lastWeek.toISOString(),
          status: 'completed',
          total: 50.00,
          currency: 'USD',
        })
        .returning('id');

      const order1Id = typeof order1 === 'object' ? order1.id : order1;
      const order2Id = typeof order2 === 'object' ? order2.id : order2;
      const order3Id = typeof order3 === 'object' ? order3.id : order3;
      const order4Id = typeof order4 === 'object' ? order4.id : order4;

      // Insert order items
      await primaryDb('order_items').insert([
        // Order 1: 2x Widget Alpha ($50), 1x Widget Beta ($75)
        {
          order_id: order1Id,
          store_id: TEST_STORE_ID,
          product_id: productAId,
          product_name: 'Widget Alpha',
          quantity: 2,
          subtotal: 50.00,
          total: 50.00,
        },
        {
          order_id: order1Id,
          store_id: TEST_STORE_ID,
          product_id: productBId,
          product_name: 'Widget Beta',
          quantity: 1,
          subtotal: 75.00,
          total: 75.00,
        },
        // Order 2: 3x Widget Alpha ($75)
        {
          order_id: order2Id,
          store_id: TEST_STORE_ID,
          product_id: productAId,
          product_name: 'Widget Alpha',
          quantity: 3,
          subtotal: 75.00,
          total: 75.00,
        },
        // Order 3 (cancelled — should not count): 1x Widget Alpha
        {
          order_id: order3Id,
          store_id: TEST_STORE_ID,
          product_id: productAId,
          product_name: 'Widget Alpha',
          quantity: 1,
          subtotal: 25.00,
          total: 25.00,
        },
        // Order 4 (last week): 2x Low Stock Widget
        {
          order_id: order4Id,
          store_id: TEST_STORE_ID,
          product_id: productDId,
          product_name: 'Low Stock Widget',
          quantity: 2,
          subtotal: 20.00,
          total: 20.00,
        },
      ]);

      // Create readonly connection
      readonlyDb = createReadonlyDb(READONLY_URL);
      await readonlyDb.raw('SELECT 1');

      dbAvailable = true;
    } catch (error) {
      dbAvailable = false;
      // eslint-disable-next-line no-console
      console.warn('Skipping product queries integration tests: DB setup failed.', error);
    }
  });

  afterAll(async () => {
    if (primaryDb) {
      try {
        await primaryDb('order_items')
          .whereIn('store_id', [TEST_STORE_ID, OTHER_STORE_ID])
          .delete();
        await primaryDb('orders')
          .whereIn('store_id', [TEST_STORE_ID, OTHER_STORE_ID])
          .delete();
        await primaryDb('products')
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

  describe('topSellersByQuantity', () => {
    it('returns products sorted by quantity excluding cancelled orders', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.topSellersByQuantity(TEST_STORE_ID);

      // Widget Alpha: 2 + 3 = 5 (excludes 1 from cancelled order)
      // Low Stock Widget: 2
      // Widget Beta: 1
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result[0].productName).toBe('Widget Alpha');
      expect(result[0].totalQuantity).toBe(5);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.topSellersByQuantity(OTHER_STORE_ID);

      // Other store has no order_items
      expect(result).toEqual([]);
    });

    it('returns empty array for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.topSellersByQuantity('00000000-0000-0000-0000-000000000000');

      expect(result).toEqual([]);
    });

    it('respects limit parameter', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.topSellersByQuantity(TEST_STORE_ID, 2);

      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('topSellersByRevenue', () => {
    it('returns products sorted by revenue', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.topSellersByRevenue(TEST_STORE_ID);

      // Widget Alpha: $50 + $75 = $125
      // Widget Beta: $75
      // Low Stock Widget: $20
      expect(result.length).toBeGreaterThanOrEqual(3);
      expect(result[0].productName).toBe('Widget Alpha');
      expect(result[0].totalRevenue).toBe(125);
    });
  });

  describe('categoryPerformance', () => {
    it('returns categories with correct aggregations', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.categoryPerformance(TEST_STORE_ID);

      // Electronics: Widget Alpha ($125 revenue, 5 units), Widget Beta ($75 revenue, 1 unit)
      //   total revenue = $200, total quantity = 6, product count = 2
      // Accessories: Low Stock Widget ($20 revenue, 2 units)
      //   total revenue = $20, total quantity = 2, product count = 1
      expect(result.length).toBeGreaterThanOrEqual(2);

      const electronics = result.find((r) => r.categoryName === 'Electronics');
      expect(electronics).toBeDefined();
      expect(electronics!.totalRevenue).toBe(200);
      expect(electronics!.totalQuantitySold).toBe(6);
      expect(electronics!.productCount).toBeGreaterThanOrEqual(2);

      const accessories = result.find((r) => r.categoryName === 'Accessories');
      expect(accessories).toBeDefined();
      expect(accessories!.totalRevenue).toBe(20);
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.categoryPerformance(OTHER_STORE_ID);

      expect(result).toEqual([]);
    });
  });

  describe('lowStockProducts', () => {
    it('returns products with stock at or below threshold', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.lowStockProducts(TEST_STORE_ID);

      // Widget Beta: stock_quantity = 3 (<=5)
      // Low Stock Widget: stock_quantity = 2 (<=5)
      expect(result.length).toBeGreaterThanOrEqual(2);

      const names = result.map((r) => r.productName);
      expect(names).toContain('Widget Beta');
      expect(names).toContain('Low Stock Widget');

      // Should NOT include Widget Alpha (stock_quantity = 50) or Gadget Gamma (outofstock)
      expect(names).not.toContain('Widget Alpha');
      expect(names).not.toContain('Gadget Gamma');
    });

    it('respects custom threshold', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.lowStockProducts(TEST_STORE_ID, 2);

      // Only Low Stock Widget with stock_quantity = 2
      expect(result.length).toBeGreaterThanOrEqual(1);
      const names = result.map((r) => r.productName);
      expect(names).toContain('Low Stock Widget');
    });
  });

  describe('outOfStockProducts', () => {
    it('returns out of stock products', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.outOfStockProducts(TEST_STORE_ID);

      expect(result.length).toBeGreaterThanOrEqual(1);
      const names = result.map((r) => r.productName);
      expect(names).toContain('Gadget Gamma');
    });

    it('isolates data by store_id', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.outOfStockProducts(OTHER_STORE_ID);

      // Other store has no outofstock products
      expect(result).toEqual([]);
    });
  });

  describe('productSalesByPeriod', () => {
    it('returns product sales filtered by date range', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      // Wide date range covering all test data
      const result = await queries.productSalesByPeriod(
        TEST_STORE_ID,
        '2020-01-01',
        '2030-01-01',
      );

      expect(result.length).toBeGreaterThanOrEqual(3);
      // Sorted by revenue DESC: Widget Alpha ($125), Widget Beta ($75), Low Stock Widget ($20)
      expect(result[0].productName).toBe('Widget Alpha');
      expect(result[0].totalRevenue).toBe(125);
    });

    it('returns empty array for non-existent store', async () => {
      if (!dbAvailable) return;

      const queries = createProductQueries({ readonlyDb });
      const result = await queries.productSalesByPeriod(
        '00000000-0000-0000-0000-000000000000',
        '2020-01-01',
        '2030-01-01',
      );

      expect(result).toEqual([]);
    });
  });
});
