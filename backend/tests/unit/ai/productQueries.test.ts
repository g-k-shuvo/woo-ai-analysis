import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createProductQueries } = await import('../../../src/ai/productQueries.js');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ──────────────────────────────────────────────────────────

const VALID_STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.Mock<(...args: any[]) => any>;

interface MockQueryBuilder {
  where: AnyMock;
  whereIn: AnyMock;
  whereRaw: AnyMock;
  whereNotNull: AnyMock;
  select: AnyMock;
  first: AnyMock;
  groupBy: AnyMock;
  groupByRaw: AnyMock;
  orderBy: AnyMock;
  orderByRaw: AnyMock;
  limit: AnyMock;
  join: AnyMock;
}

function createMockQueryBuilder(
  allResults: Array<Record<string, unknown>> = [],
): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    where: jest.fn(),
    whereIn: jest.fn(),
    whereRaw: jest.fn(),
    whereNotNull: jest.fn(),
    select: jest.fn(),
    first: jest.fn(),
    groupBy: jest.fn(),
    groupByRaw: jest.fn(),
    orderBy: jest.fn(),
    orderByRaw: jest.fn(),
    limit: jest.fn(),
    join: jest.fn(),
  };

  // Chain all methods back to builder
  builder.where.mockReturnValue(builder);
  builder.whereIn.mockReturnValue(builder);
  builder.whereRaw.mockReturnValue(builder);
  builder.whereNotNull.mockReturnValue(builder);
  builder.select.mockReturnValue(builder);
  builder.groupBy.mockReturnValue(builder);
  builder.groupByRaw.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  builder.orderByRaw.mockReturnValue(builder);
  builder.join.mockReturnValue(builder);
  builder.limit.mockResolvedValue(allResults);

  return builder;
}

function createMockDb(builders: MockQueryBuilder | MockQueryBuilder[]) {
  const builderArray = Array.isArray(builders) ? [...builders] : [builders];
  let callIndex = 0;

  const mockDb = jest.fn(() => {
    const builder = builderArray[callIndex] ?? builderArray[builderArray.length - 1];
    callIndex++;
    return builder;
  });

  // Attach raw for select expressions and join conditions
  (mockDb as unknown as Record<string, unknown>).raw = jest.fn(
    (expr: string) => ({ toString: () => expr }),
  );

  return mockDb;
}

describe('createProductQueries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── topSellersByQuantity ──────────────────────────────────

  describe('topSellersByQuantity', () => {
    it('returns products sorted by quantity', async () => {
      const builder = createMockQueryBuilder([
        { product_name: 'Widget A', total_quantity: '50', total_revenue: '500.00' },
        { product_name: 'Widget B', total_quantity: '30', total_revenue: '900.00' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.topSellersByQuantity(VALID_STORE_ID);

      expect(result).toEqual([
        { productName: 'Widget A', totalQuantity: 50, totalRevenue: 500 },
        { productName: 'Widget B', totalQuantity: 30, totalRevenue: 900 },
      ]);
    });

    it('defaults to limit 10', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.topSellersByQuantity(VALID_STORE_ID);

      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it('respects custom limit', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.topSellersByQuantity(VALID_STORE_ID, 5);

      expect(builder.limit).toHaveBeenCalledWith(5);
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.topSellersByQuantity(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith('oi.store_id', VALID_STORE_ID);
    });

    it('filters by revenue statuses (completed, processing)', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.topSellersByQuantity(VALID_STORE_ID);

      expect(builder.whereIn).toHaveBeenCalledWith('o.status', ['completed', 'processing']);
    });

    it('returns empty array when no products exist', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.topSellersByQuantity(VALID_STORE_ID);

      expect(result).toEqual([]);
    });

    it('rounds monetary values to 2 decimal places', async () => {
      const builder = createMockQueryBuilder([
        { product_name: 'Widget A', total_quantity: '3', total_revenue: '123.567' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.topSellersByQuantity(VALID_STORE_ID);

      expect(result[0].totalRevenue).toBe(123.57);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.topSellersByQuantity('not-a-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for empty storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.topSellersByQuantity('')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for limit < 1', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.topSellersByQuantity(VALID_STORE_ID, 0)).rejects.toThrow(
        'limit must be an integer between 1 and 100',
      );
    });

    it('throws ValidationError for limit > 100', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.topSellersByQuantity(VALID_STORE_ID, 101)).rejects.toThrow(
        'limit must be an integer between 1 and 100',
      );
    });

    it('throws ValidationError for non-integer limit', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.topSellersByQuantity(VALID_STORE_ID, 3.5)).rejects.toThrow(
        'limit must be an integer between 1 and 100',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('connection refused'));
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.topSellersByQuantity(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch top sellers by quantity',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder([
        { product_name: 'Widget A', total_quantity: '10', total_revenue: '100' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.topSellersByQuantity(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID, limit: 10 },
        'Product query: topSellersByQuantity start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
          resultCount: 1,
        }),
        'Product query: topSellersByQuantity completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      try {
        await queries.topSellersByQuantity(VALID_STORE_ID);
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db error',
        }),
        'Product query: topSellersByQuantity failed',
      );
    });
  });

  // ── topSellersByRevenue ───────────────────────────────────

  describe('topSellersByRevenue', () => {
    it('returns products sorted by revenue', async () => {
      const builder = createMockQueryBuilder([
        { product_name: 'Premium Widget', total_quantity: '5', total_revenue: '2500.00' },
        { product_name: 'Basic Widget', total_quantity: '50', total_revenue: '500.00' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.topSellersByRevenue(VALID_STORE_ID);

      expect(result).toEqual([
        { productName: 'Premium Widget', totalQuantity: 5, totalRevenue: 2500 },
        { productName: 'Basic Widget', totalQuantity: 50, totalRevenue: 500 },
      ]);
    });

    it('defaults to limit 10', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.topSellersByRevenue(VALID_STORE_ID);

      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it('respects custom limit', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.topSellersByRevenue(VALID_STORE_ID, 20);

      expect(builder.limit).toHaveBeenCalledWith(20);
    });

    it('filters by store_id and revenue statuses', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.topSellersByRevenue(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith('oi.store_id', VALID_STORE_ID);
      expect(builder.whereIn).toHaveBeenCalledWith('o.status', ['completed', 'processing']);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.topSellersByRevenue('bad')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('timeout'));
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.topSellersByRevenue(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch top sellers by revenue',
      );
    });
  });

  // ── categoryPerformance ───────────────────────────────────

  describe('categoryPerformance', () => {
    it('returns categories with revenue, quantity, and product count', async () => {
      const builder = createMockQueryBuilder([
        {
          category_name: 'Electronics',
          total_revenue: '5000.00',
          total_quantity_sold: '100',
          product_count: '15',
        },
        {
          category_name: 'Clothing',
          total_revenue: '3000.00',
          total_quantity_sold: '200',
          product_count: '25',
        },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.categoryPerformance(VALID_STORE_ID);

      expect(result).toEqual([
        {
          categoryName: 'Electronics',
          totalRevenue: 5000,
          totalQuantitySold: 100,
          productCount: 15,
        },
        {
          categoryName: 'Clothing',
          totalRevenue: 3000,
          totalQuantitySold: 200,
          productCount: 25,
        },
      ]);
    });

    it('returns empty array when no categories exist', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.categoryPerformance(VALID_STORE_ID);

      expect(result).toEqual([]);
    });

    it('filters by store_id and revenue statuses', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.categoryPerformance(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith('oi.store_id', VALID_STORE_ID);
      expect(builder.whereIn).toHaveBeenCalledWith('o.status', ['completed', 'processing']);
    });

    it('excludes null category names', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.categoryPerformance(VALID_STORE_ID);

      expect(builder.whereNotNull).toHaveBeenCalledWith('p.category_name');
    });

    it('rounds monetary values to 2 decimal places', async () => {
      const builder = createMockQueryBuilder([
        {
          category_name: 'Test',
          total_revenue: '1234.567',
          total_quantity_sold: '10',
          product_count: '3',
        },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.categoryPerformance(VALID_STORE_ID);

      expect(result[0].totalRevenue).toBe(1234.57);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.categoryPerformance('bad-id')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('query timeout'));
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.categoryPerformance(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch category performance',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.categoryPerformance(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID },
        'Product query: categoryPerformance start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
          resultCount: 0,
        }),
        'Product query: categoryPerformance completed',
      );
    });
  });

  // ── lowStockProducts ──────────────────────────────────────

  describe('lowStockProducts', () => {
    it('returns low stock products', async () => {
      const builder = createMockQueryBuilder([
        {
          product_name: 'Widget A',
          sku: 'WA-001',
          stock_quantity: '2',
          stock_status: 'instock',
          price: '19.99',
        },
        {
          product_name: 'Widget B',
          sku: null,
          stock_quantity: '5',
          stock_status: 'instock',
          price: '29.99',
        },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.lowStockProducts(VALID_STORE_ID);

      expect(result).toEqual([
        {
          productName: 'Widget A',
          sku: 'WA-001',
          stockQuantity: 2,
          stockStatus: 'instock',
          price: 19.99,
        },
        {
          productName: 'Widget B',
          sku: null,
          stockQuantity: 5,
          stockStatus: 'instock',
          price: 29.99,
        },
      ]);
    });

    it('defaults threshold to 5', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.lowStockProducts(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith('stock_quantity', '<=', 5);
    });

    it('respects custom threshold', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.lowStockProducts(VALID_STORE_ID, 10);

      expect(builder.where).toHaveBeenCalledWith('stock_quantity', '<=', 10);
    });

    it('filters by store_id', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.lowStockProducts(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({
        store_id: VALID_STORE_ID,
        stock_status: 'instock',
        status: 'publish',
      });
    });

    it('filters for non-null stock_quantity', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.lowStockProducts(VALID_STORE_ID);

      expect(builder.whereNotNull).toHaveBeenCalledWith('stock_quantity');
    });

    it('returns empty array when no low stock products', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.lowStockProducts(VALID_STORE_ID);

      expect(result).toEqual([]);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.lowStockProducts('not-a-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('throws ValidationError for negative threshold', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.lowStockProducts(VALID_STORE_ID, -1)).rejects.toThrow(
        'threshold must be an integer between 0 and 10000',
      );
    });

    it('throws ValidationError for non-integer threshold', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.lowStockProducts(VALID_STORE_ID, 2.5)).rejects.toThrow(
        'threshold must be an integer between 0 and 10000',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('db error'));
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.lowStockProducts(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch low stock products',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.lowStockProducts(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID, threshold: 5 },
        'Product query: lowStockProducts start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
          resultCount: 0,
        }),
        'Product query: lowStockProducts completed',
      );
    });

    it('rounds price to 2 decimal places', async () => {
      const builder = createMockQueryBuilder([
        {
          product_name: 'Widget',
          sku: 'W-1',
          stock_quantity: '3',
          stock_status: 'instock',
          price: '19.999',
        },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.lowStockProducts(VALID_STORE_ID);

      expect(result[0].price).toBe(20);
    });
  });

  // ── outOfStockProducts ────────────────────────────────────

  describe('outOfStockProducts', () => {
    it('returns out of stock products', async () => {
      const builder = createMockQueryBuilder([
        {
          product_name: 'Sold Out Widget',
          sku: 'SOW-001',
          stock_quantity: '0',
          stock_status: 'outofstock',
          price: '49.99',
        },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.outOfStockProducts(VALID_STORE_ID);

      expect(result).toEqual([
        {
          productName: 'Sold Out Widget',
          sku: 'SOW-001',
          stockQuantity: 0,
          stockStatus: 'outofstock',
          price: 49.99,
        },
      ]);
    });

    it('filters by store_id and outofstock status', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.outOfStockProducts(VALID_STORE_ID);

      expect(builder.where).toHaveBeenCalledWith({
        store_id: VALID_STORE_ID,
        stock_status: 'outofstock',
        status: 'publish',
      });
    });

    it('returns empty array when no out of stock products', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.outOfStockProducts(VALID_STORE_ID);

      expect(result).toEqual([]);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.outOfStockProducts('bad-uuid')).rejects.toThrow(
        'Invalid storeId: must be a valid UUID',
      );
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('connection error'));
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(queries.outOfStockProducts(VALID_STORE_ID)).rejects.toThrow(
        'Failed to fetch out of stock products',
      );
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.outOfStockProducts(VALID_STORE_ID);

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID },
        'Product query: outOfStockProducts start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
          resultCount: 0,
        }),
        'Product query: outOfStockProducts completed',
      );
    });
  });

  // ── productSalesByPeriod ──────────────────────────────────

  describe('productSalesByPeriod', () => {
    it('returns product sales for a date range', async () => {
      const builder = createMockQueryBuilder([
        { product_name: 'Widget A', total_quantity: '20', total_revenue: '400.00' },
        { product_name: 'Widget B', total_quantity: '10', total_revenue: '300.00' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.productSalesByPeriod(
        VALID_STORE_ID,
        '2026-01-01',
        '2026-02-01',
      );

      expect(result).toEqual([
        { productName: 'Widget A', totalQuantity: 20, totalRevenue: 400 },
        { productName: 'Widget B', totalQuantity: 10, totalRevenue: 300 },
      ]);
    });

    it('filters by store_id, statuses, and date range', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.productSalesByPeriod(VALID_STORE_ID, '2026-01-01', '2026-02-01');

      expect(builder.where).toHaveBeenCalledWith('oi.store_id', VALID_STORE_ID);
      expect(builder.whereIn).toHaveBeenCalledWith('o.status', ['completed', 'processing']);
      expect(builder.where).toHaveBeenCalledWith('o.date_created', '>=', '2026-01-01');
      expect(builder.where).toHaveBeenCalledWith('o.date_created', '<', '2026-02-01');
    });

    it('defaults to limit 10', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.productSalesByPeriod(VALID_STORE_ID, '2026-01-01', '2026-02-01');

      expect(builder.limit).toHaveBeenCalledWith(10);
    });

    it('respects custom limit', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.productSalesByPeriod(VALID_STORE_ID, '2026-01-01', '2026-02-01', 25);

      expect(builder.limit).toHaveBeenCalledWith(25);
    });

    it('throws ValidationError for invalid startDate', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.productSalesByPeriod(VALID_STORE_ID, 'not-a-date', '2026-02-01'),
      ).rejects.toThrow('Invalid startDate');
    });

    it('throws ValidationError for invalid endDate', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.productSalesByPeriod(VALID_STORE_ID, '2026-01-01', 'bad'),
      ).rejects.toThrow('Invalid endDate');
    });

    it('throws ValidationError when startDate is after endDate', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.productSalesByPeriod(VALID_STORE_ID, '2026-03-01', '2026-01-01'),
      ).rejects.toThrow('startDate must be before or equal to endDate');
    });

    it('accepts ISO 8601 datetime format', async () => {
      const builder = createMockQueryBuilder([
        { product_name: 'Widget', total_quantity: '1', total_revenue: '10.00' },
      ]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      const result = await queries.productSalesByPeriod(
        VALID_STORE_ID,
        '2026-01-01T00:00:00Z',
        '2026-02-01T00:00:00Z',
      );

      expect(result[0].totalRevenue).toBe(10);
    });

    it('throws ValidationError for invalid storeId', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.productSalesByPeriod('bad', '2026-01-01', '2026-02-01'),
      ).rejects.toThrow('Invalid storeId: must be a valid UUID');
    });

    it('wraps DB errors as AppError', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('connection error'));
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await expect(
        queries.productSalesByPeriod(VALID_STORE_ID, '2026-01-01', '2026-02-01'),
      ).rejects.toThrow('Failed to fetch product sales by period');
    });

    it('logs start and completion', async () => {
      const builder = createMockQueryBuilder([]);
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      await queries.productSalesByPeriod(VALID_STORE_ID, '2026-01-01', '2026-02-01');

      expect(logger.info).toHaveBeenCalledWith(
        { storeId: VALID_STORE_ID, startDate: '2026-01-01', endDate: '2026-02-01', limit: 10 },
        'Product query: productSalesByPeriod start',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          durationMs: expect.any(Number),
          resultCount: 0,
        }),
        'Product query: productSalesByPeriod completed',
      );
    });

    it('logs errors on failure', async () => {
      const builder = createMockQueryBuilder([]);
      builder.limit.mockRejectedValue(new Error('db timeout'));
      const mockDb = createMockDb(builder);
      const queries = createProductQueries({ readonlyDb: mockDb as never });

      try {
        await queries.productSalesByPeriod(VALID_STORE_ID, '2026-01-01', '2026-02-01');
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: VALID_STORE_ID,
          error: 'db timeout',
        }),
        'Product query: productSalesByPeriod failed',
      );
    });
  });
});
