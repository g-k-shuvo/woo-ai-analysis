/**
 * Product Query Service — pre-built, parameterized SQL queries for common product metrics.
 *
 * Provides fast, reliable product data without the AI pipeline overhead.
 * All queries:
 * - Include WHERE store_id = ? for tenant isolation
 * - Filter by order status IN ('completed', 'processing') where applicable
 * - Use parameterized placeholders (no string concatenation)
 * - Round monetary values to 2 decimal places
 * - Run on the read-only database connection
 */

import type { Knex } from 'knex';
import { AppError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;

const REVENUE_STATUSES = ['completed', 'processing'] as const;

const DEFAULT_TOP_SELLERS_LIMIT = 10;
const MAX_TOP_SELLERS_LIMIT = 100;
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export interface TopSellerResult {
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface CategoryPerformanceResult {
  categoryName: string;
  totalRevenue: number;
  totalQuantitySold: number;
  productCount: number;
}

export interface LowStockProduct {
  productName: string;
  sku: string | null;
  stockQuantity: number;
  stockStatus: string;
  price: number;
}

export interface ProductSalesByPeriodResult {
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface ProductQueryDeps {
  readonlyDb: Knex;
}

function validateStoreId(storeId: string): void {
  if (!storeId || !UUID_RE.test(storeId)) {
    throw new ValidationError('Invalid storeId: must be a valid UUID');
  }
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TOP_SELLERS_LIMIT) {
    throw new ValidationError(`limit must be an integer between 1 and ${MAX_TOP_SELLERS_LIMIT}`);
  }
}

export function createProductQueries(deps: ProductQueryDeps) {
  const { readonlyDb } = deps;

  async function topSellersByQuantity(
    storeId: string,
    limit: number = DEFAULT_TOP_SELLERS_LIMIT,
  ): Promise<TopSellerResult[]> {
    validateStoreId(storeId);
    validateLimit(limit);

    const startTime = Date.now();
    logger.info({ storeId, limit }, 'Product query: topSellersByQuantity start');

    try {
      const rows = await readonlyDb('order_items as oi')
        .join('products as p', function (this: Knex.JoinClause) {
          this.on('oi.product_id', '=', 'p.id').andOn('p.store_id', '=', readonlyDb.raw('?', [storeId]));
        })
        .join('orders as o', function (this: Knex.JoinClause) {
          this.on('oi.order_id', '=', 'o.id').andOn('o.store_id', '=', readonlyDb.raw('?', [storeId]));
        })
        .where('oi.store_id', storeId)
        .whereIn('o.status', REVENUE_STATUSES)
        .select(
          'p.name as product_name',
          readonlyDb.raw('COALESCE(SUM(oi.quantity), 0) AS total_quantity'),
          readonlyDb.raw('COALESCE(ROUND(SUM(oi.total), 2), 0) AS total_revenue'),
        )
        .groupBy('p.name')
        .orderBy('total_quantity', 'desc')
        .limit(limit) as unknown as Array<Record<string, unknown>>;

      const results: TopSellerResult[] = rows.map((row) => ({
        productName: String(row.product_name ?? ''),
        totalQuantity: parseInt(String(row.total_quantity ?? '0'), 10) || 0,
        totalRevenue: Math.round((parseFloat(String(row.total_revenue ?? '0')) || 0) * 100) / 100,
      }));

      const durationMs = Date.now() - startTime;
      logger.info(
        { storeId, limit, durationMs, resultCount: results.length },
        'Product query: topSellersByQuantity completed',
      );

      return results;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, limit, durationMs, error: (err as Error).message },
        'Product query: topSellersByQuantity failed',
      );
      throw new AppError('Failed to fetch top sellers by quantity', {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function topSellersByRevenue(
    storeId: string,
    limit: number = DEFAULT_TOP_SELLERS_LIMIT,
  ): Promise<TopSellerResult[]> {
    validateStoreId(storeId);
    validateLimit(limit);

    const startTime = Date.now();
    logger.info({ storeId, limit }, 'Product query: topSellersByRevenue start');

    try {
      const rows = await readonlyDb('order_items as oi')
        .join('products as p', function (this: Knex.JoinClause) {
          this.on('oi.product_id', '=', 'p.id').andOn('p.store_id', '=', readonlyDb.raw('?', [storeId]));
        })
        .join('orders as o', function (this: Knex.JoinClause) {
          this.on('oi.order_id', '=', 'o.id').andOn('o.store_id', '=', readonlyDb.raw('?', [storeId]));
        })
        .where('oi.store_id', storeId)
        .whereIn('o.status', REVENUE_STATUSES)
        .select(
          'p.name as product_name',
          readonlyDb.raw('COALESCE(SUM(oi.quantity), 0) AS total_quantity'),
          readonlyDb.raw('COALESCE(ROUND(SUM(oi.total), 2), 0) AS total_revenue'),
        )
        .groupBy('p.name')
        .orderBy('total_revenue', 'desc')
        .limit(limit) as unknown as Array<Record<string, unknown>>;

      const results: TopSellerResult[] = rows.map((row) => ({
        productName: String(row.product_name ?? ''),
        totalQuantity: parseInt(String(row.total_quantity ?? '0'), 10) || 0,
        totalRevenue: Math.round((parseFloat(String(row.total_revenue ?? '0')) || 0) * 100) / 100,
      }));

      const durationMs = Date.now() - startTime;
      logger.info(
        { storeId, limit, durationMs, resultCount: results.length },
        'Product query: topSellersByRevenue completed',
      );

      return results;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, limit, durationMs, error: (err as Error).message },
        'Product query: topSellersByRevenue failed',
      );
      throw new AppError('Failed to fetch top sellers by revenue', {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function categoryPerformance(storeId: string): Promise<CategoryPerformanceResult[]> {
    validateStoreId(storeId);

    const startTime = Date.now();
    logger.info({ storeId }, 'Product query: categoryPerformance start');

    try {
      const rows = await readonlyDb('order_items as oi')
        .join('products as p', function (this: Knex.JoinClause) {
          this.on('oi.product_id', '=', 'p.id').andOn('p.store_id', '=', readonlyDb.raw('?', [storeId]));
        })
        .join('orders as o', function (this: Knex.JoinClause) {
          this.on('oi.order_id', '=', 'o.id').andOn('o.store_id', '=', readonlyDb.raw('?', [storeId]));
        })
        .where('oi.store_id', storeId)
        .whereIn('o.status', REVENUE_STATUSES)
        .whereNotNull('p.category_name')
        .select(
          'p.category_name',
          readonlyDb.raw('COALESCE(ROUND(SUM(oi.total), 2), 0) AS total_revenue'),
          readonlyDb.raw('COALESCE(SUM(oi.quantity), 0) AS total_quantity_sold'),
          readonlyDb.raw('COUNT(DISTINCT p.id) AS product_count'),
        )
        .groupBy('p.category_name')
        .orderByRaw('COALESCE(ROUND(SUM(oi.total), 2), 0) DESC')
        .limit(50) as unknown as Array<Record<string, unknown>>;

      const results: CategoryPerformanceResult[] = rows.map((row) => ({
        categoryName: String(row.category_name ?? ''),
        totalRevenue: Math.round((parseFloat(String(row.total_revenue ?? '0')) || 0) * 100) / 100,
        totalQuantitySold: parseInt(String(row.total_quantity_sold ?? '0'), 10) || 0,
        productCount: parseInt(String(row.product_count ?? '0'), 10) || 0,
      }));

      const durationMs = Date.now() - startTime;
      logger.info(
        { storeId, durationMs, resultCount: results.length },
        'Product query: categoryPerformance completed',
      );

      return results;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, durationMs, error: (err as Error).message },
        'Product query: categoryPerformance failed',
      );
      throw new AppError('Failed to fetch category performance', {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function lowStockProducts(
    storeId: string,
    threshold: number = DEFAULT_LOW_STOCK_THRESHOLD,
  ): Promise<LowStockProduct[]> {
    validateStoreId(storeId);

    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10000) {
      throw new ValidationError('threshold must be an integer between 0 and 10000');
    }

    const startTime = Date.now();
    logger.info({ storeId, threshold }, 'Product query: lowStockProducts start');

    try {
      const rows = await readonlyDb('products')
        .where({ store_id: storeId, stock_status: 'instock', status: 'publish' })
        .where('stock_quantity', '<=', threshold)
        .whereNotNull('stock_quantity')
        .select(
          'name as product_name',
          'sku',
          'stock_quantity',
          'stock_status',
          readonlyDb.raw('COALESCE(price, 0) AS price'),
        )
        .orderBy('stock_quantity', 'asc')
        .limit(100) as unknown as Array<Record<string, unknown>>;

      const results: LowStockProduct[] = rows.map((row) => ({
        productName: String(row.product_name ?? ''),
        sku: row.sku != null ? String(row.sku) : null,
        stockQuantity: parseInt(String(row.stock_quantity ?? '0'), 10) || 0,
        stockStatus: String(row.stock_status ?? ''),
        price: Math.round((parseFloat(String(row.price ?? '0')) || 0) * 100) / 100,
      }));

      const durationMs = Date.now() - startTime;
      logger.info(
        { storeId, threshold, durationMs, resultCount: results.length },
        'Product query: lowStockProducts completed',
      );

      return results;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, threshold, durationMs, error: (err as Error).message },
        'Product query: lowStockProducts failed',
      );
      throw new AppError('Failed to fetch low stock products', {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function outOfStockProducts(storeId: string): Promise<LowStockProduct[]> {
    validateStoreId(storeId);

    const startTime = Date.now();
    logger.info({ storeId }, 'Product query: outOfStockProducts start');

    try {
      const rows = await readonlyDb('products')
        .where({ store_id: storeId, stock_status: 'outofstock', status: 'publish' })
        .select(
          'name as product_name',
          'sku',
          readonlyDb.raw('COALESCE(stock_quantity, 0) AS stock_quantity'),
          'stock_status',
          readonlyDb.raw('COALESCE(price, 0) AS price'),
        )
        .orderBy('name', 'asc')
        .limit(100) as unknown as Array<Record<string, unknown>>;

      const results: LowStockProduct[] = rows.map((row) => ({
        productName: String(row.product_name ?? ''),
        sku: row.sku != null ? String(row.sku) : null,
        stockQuantity: parseInt(String(row.stock_quantity ?? '0'), 10) || 0,
        stockStatus: String(row.stock_status ?? ''),
        price: Math.round((parseFloat(String(row.price ?? '0')) || 0) * 100) / 100,
      }));

      const durationMs = Date.now() - startTime;
      logger.info(
        { storeId, durationMs, resultCount: results.length },
        'Product query: outOfStockProducts completed',
      );

      return results;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, durationMs, error: (err as Error).message },
        'Product query: outOfStockProducts failed',
      );
      throw new AppError('Failed to fetch out of stock products', {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async function productSalesByPeriod(
    storeId: string,
    startDate: string,
    endDate: string,
    limit: number = DEFAULT_TOP_SELLERS_LIMIT,
  ): Promise<ProductSalesByPeriodResult[]> {
    validateStoreId(storeId);
    validateLimit(limit);

    if (!startDate || !ISO_DATE_RE.test(startDate)) {
      throw new ValidationError('Invalid startDate: must be ISO 8601 format (YYYY-MM-DD)');
    }
    if (!endDate || !ISO_DATE_RE.test(endDate)) {
      throw new ValidationError('Invalid endDate: must be ISO 8601 format (YYYY-MM-DD)');
    }
    if (startDate > endDate) {
      throw new ValidationError('startDate must be before or equal to endDate');
    }

    const startTime = Date.now();
    logger.info({ storeId, startDate, endDate, limit }, 'Product query: productSalesByPeriod start');

    try {
      const rows = await readonlyDb('order_items as oi')
        .join('products as p', function (this: Knex.JoinClause) {
          this.on('oi.product_id', '=', 'p.id').andOn('p.store_id', '=', readonlyDb.raw('?', [storeId]));
        })
        .join('orders as o', function (this: Knex.JoinClause) {
          this.on('oi.order_id', '=', 'o.id').andOn('o.store_id', '=', readonlyDb.raw('?', [storeId]));
        })
        .where('oi.store_id', storeId)
        .whereIn('o.status', REVENUE_STATUSES)
        .where('o.date_created', '>=', startDate)
        .where('o.date_created', '<', endDate)
        .select(
          'p.name as product_name',
          readonlyDb.raw('COALESCE(SUM(oi.quantity), 0) AS total_quantity'),
          readonlyDb.raw('COALESCE(ROUND(SUM(oi.total), 2), 0) AS total_revenue'),
        )
        .groupBy('p.name')
        .orderBy('total_revenue', 'desc')
        .limit(limit) as unknown as Array<Record<string, unknown>>;

      const results: ProductSalesByPeriodResult[] = rows.map((row) => ({
        productName: String(row.product_name ?? ''),
        totalQuantity: parseInt(String(row.total_quantity ?? '0'), 10) || 0,
        totalRevenue: Math.round((parseFloat(String(row.total_revenue ?? '0')) || 0) * 100) / 100,
      }));

      const durationMs = Date.now() - startTime;
      logger.info(
        { storeId, startDate, endDate, limit, durationMs, resultCount: results.length },
        'Product query: productSalesByPeriod completed',
      );

      return results;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      logger.error(
        { storeId, startDate, endDate, limit, durationMs, error: (err as Error).message },
        'Product query: productSalesByPeriod failed',
      );
      throw new AppError('Failed to fetch product sales by period', {
        cause: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  return {
    topSellersByQuantity,
    topSellersByRevenue,
    categoryPerformance,
    lowStockProducts,
    outOfStockProducts,
    productSalesByPeriod,
  };
}

export type ProductQueries = ReturnType<typeof createProductQueries>;
