import { jest, describe, it, expect } from '@jest/globals';

// Mock logger before importing the module under test
jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createSchemaContextService } = await import(
  '../../../src/ai/schemaContext.js'
);

// ── Mock DB builder ─────────────────────────────────────────
interface MockChain {
  where: jest.Mock;
  select: jest.Mock;
  count: jest.Mock;
  orderBy: jest.Mock;
  first: jest.Mock<() => Promise<unknown>>;
  raw: jest.Mock;
}

function createSimpleMockDb() {
  function createChain(): MockChain {
    const chain: MockChain = {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
      raw: jest.fn().mockReturnValue('RAW_SQL'),
    };
    return chain;
  }

  const callCounts: Record<string, number> = {};
  const chains: Record<string, MockChain[]> = {};

  const db = jest.fn((tableName: string) => {
    if (!chains[tableName]) {
      chains[tableName] = [];
    }
    if (!callCounts[tableName]) {
      callCounts[tableName] = 0;
    }

    const idx = callCounts[tableName];
    if (!chains[tableName][idx]) {
      chains[tableName][idx] = createChain();
    }

    const chain = chains[tableName][idx];
    callCounts[tableName]++;
    return chain;
  });

  Object.assign(db, {
    raw: jest.fn().mockReturnValue('RAW_SQL'),
  });

  return {
    db: db as any, // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

describe('SchemaContextService', () => {
  describe('getStoreContext', () => {
    it('fetches order stats, product/customer/category counts, and currency', async () => {
      const { db } = createSimpleMockDb();

      const service = createSchemaContextService({ db });
      const result = await service.getStoreContext('store-xyz');

      expect(result).toBeDefined();
      expect(result.storeId).toBe('store-xyz');
    });

    it('returns correct store context for a store with data', async () => {
      // Use a more direct mocking approach
      const orderStatsFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({
          total_orders: '150',
          earliest_order_date: '2025-01-15T00:00:00Z',
          latest_order_date: '2026-02-10T23:59:59Z',
        });

      const productCountFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ count: '42' });

      const customerCountFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ count: '80' });

      const categoryCountFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ count: '5' });

      const currencyFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ currency: 'EUR' });

      let ordersCallCount = 0;

      const db = jest.fn((tableName: string) => {
        if (tableName === 'orders') {
          ordersCallCount++;
          if (ordersCallCount === 1) {
            // Stats query
            return {
              where: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  first: orderStatsFirst,
                }),
              }),
            };
          } else {
            // Currency query
            return {
              where: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  orderBy: jest.fn().mockReturnValue({
                    first: currencyFirst,
                  }),
                }),
              }),
            };
          }
        }
        if (tableName === 'products') {
          return {
            where: jest.fn().mockReturnValue({
              count: jest.fn().mockReturnValue({
                first: productCountFirst,
              }),
            }),
          };
        }
        if (tableName === 'customers') {
          return {
            where: jest.fn().mockReturnValue({
              count: jest.fn().mockReturnValue({
                first: customerCountFirst,
              }),
            }),
          };
        }
        if (tableName === 'categories') {
          return {
            where: jest.fn().mockReturnValue({
              count: jest.fn().mockReturnValue({
                first: categoryCountFirst,
              }),
            }),
          };
        }
        return {};
      });

      Object.assign(db, {
        raw: jest.fn().mockReturnValue('RAW_SQL'),
      });

      const service = createSchemaContextService({ db: db as any }); // eslint-disable-line @typescript-eslint/no-explicit-any
      const ctx = await service.getStoreContext('store-xyz');

      expect(ctx).toEqual({
        storeId: 'store-xyz',
        currency: 'EUR',
        totalOrders: 150,
        totalProducts: 42,
        totalCustomers: 80,
        totalCategories: 5,
        earliestOrderDate: '2025-01-15T00:00:00Z',
        latestOrderDate: '2026-02-10T23:59:59Z',
      });
    });

    it('returns default values for a store with no data', async () => {
      const emptyFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({
          total_orders: '0',
          earliest_order_date: null,
          latest_order_date: null,
        });

      const zeroCountFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ count: '0' });

      const noCurrencyFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(undefined);

      let ordersCallCount = 0;

      const db = jest.fn((tableName: string) => {
        if (tableName === 'orders') {
          ordersCallCount++;
          if (ordersCallCount === 1) {
            return {
              where: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  first: emptyFirst,
                }),
              }),
            };
          } else {
            return {
              where: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  orderBy: jest.fn().mockReturnValue({
                    first: noCurrencyFirst,
                  }),
                }),
              }),
            };
          }
        }
        return {
          where: jest.fn().mockReturnValue({
            count: jest.fn().mockReturnValue({
              first: zeroCountFirst,
            }),
          }),
        };
      });

      Object.assign(db, {
        raw: jest.fn().mockReturnValue('RAW_SQL'),
      });

      const service = createSchemaContextService({ db: db as any }); // eslint-disable-line @typescript-eslint/no-explicit-any
      const ctx = await service.getStoreContext('empty-store');

      expect(ctx.storeId).toBe('empty-store');
      expect(ctx.currency).toBe('USD');
      expect(ctx.totalOrders).toBe(0);
      expect(ctx.totalProducts).toBe(0);
      expect(ctx.totalCustomers).toBe(0);
      expect(ctx.totalCategories).toBe(0);
      expect(ctx.earliestOrderDate).toBeNull();
      expect(ctx.latestOrderDate).toBeNull();
    });

    it('queries all tables with store_id filter', async () => {
      const storeId = 'tenant-isolation-test';
      const whereSpies: Array<{ table: string; spy: jest.Mock }> = [];

      const db = jest.fn((tableName: string) => {
        const whereSpy = jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            first: jest
              .fn<() => Promise<unknown>>()
              .mockResolvedValue({
                total_orders: '0',
                earliest_order_date: null,
                latest_order_date: null,
              }),
            orderBy: jest.fn().mockReturnValue({
              first: jest
                .fn<() => Promise<unknown>>()
                .mockResolvedValue(undefined),
            }),
          }),
          count: jest.fn().mockReturnValue({
            first: jest
              .fn<() => Promise<unknown>>()
              .mockResolvedValue({ count: '0' }),
          }),
        });

        whereSpies.push({ table: tableName, spy: whereSpy });

        return { where: whereSpy };
      });

      Object.assign(db, {
        raw: jest.fn().mockReturnValue('RAW_SQL'),
      });

      const service = createSchemaContextService({ db: db as any }); // eslint-disable-line @typescript-eslint/no-explicit-any
      await service.getStoreContext(storeId);

      // All where() calls should filter by store_id
      for (const entry of whereSpies) {
        expect(entry.spy).toHaveBeenCalledWith({ store_id: storeId });
      }

      // Should have queried orders (2x), products, customers, categories
      const tables = whereSpies.map((w) => w.table);
      expect(tables.filter((t) => t === 'orders').length).toBe(2);
      expect(tables).toContain('products');
      expect(tables).toContain('customers');
      expect(tables).toContain('categories');
    });

    it('handles null order stats gracefully', async () => {
      const nullStatsFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue(undefined);

      const zeroCountFirst = jest
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ count: '0' });

      let ordersCallCount = 0;

      const db = jest.fn((tableName: string) => {
        if (tableName === 'orders') {
          ordersCallCount++;
          if (ordersCallCount === 1) {
            return {
              where: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  first: nullStatsFirst,
                }),
              }),
            };
          } else {
            return {
              where: jest.fn().mockReturnValue({
                select: jest.fn().mockReturnValue({
                  orderBy: jest.fn().mockReturnValue({
                    first: jest
                      .fn<() => Promise<unknown>>()
                      .mockResolvedValue(undefined),
                  }),
                }),
              }),
            };
          }
        }
        return {
          where: jest.fn().mockReturnValue({
            count: jest.fn().mockReturnValue({
              first: zeroCountFirst,
            }),
          }),
        };
      });

      Object.assign(db, {
        raw: jest.fn().mockReturnValue('RAW_SQL'),
      });

      const service = createSchemaContextService({ db: db as any }); // eslint-disable-line @typescript-eslint/no-explicit-any
      const ctx = await service.getStoreContext('store-null');

      expect(ctx.totalOrders).toBe(0);
      expect(ctx.earliestOrderDate).toBeNull();
      expect(ctx.latestOrderDate).toBeNull();
      expect(ctx.currency).toBe('USD');
    });
  });
});
