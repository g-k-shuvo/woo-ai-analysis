/**
 * Schema context service — fetches store-specific metadata from the database
 * for injection into the AI system prompt.
 *
 * Every DB query MUST include WHERE store_id = ? for tenant isolation.
 */

import type { Knex } from 'knex';
import { AppError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StoreContext {
  storeId: string;
  currency: string;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  totalCategories: number;
  earliestOrderDate: string | null;
  latestOrderDate: string | null;
}

export interface SchemaContextDeps {
  db: Knex;
}

export function createSchemaContextService(deps: SchemaContextDeps) {
  const { db } = deps;

  async function getStoreContext(storeId: string): Promise<StoreContext> {
    if (!storeId || !UUID_RE.test(storeId)) {
      throw new ValidationError('Invalid storeId: must be a valid UUID');
    }

    try {
      const [orderStats, productCount, customerCount, categoryCount, currencyRow] =
        await Promise.all([
          db('orders')
            .where({ store_id: storeId })
            .select(
              db.raw('COUNT(*) AS total_orders'),
              db.raw('MIN(date_created) AS earliest_order_date'),
              db.raw('MAX(date_created) AS latest_order_date'),
            )
            .first<{
              total_orders: string;
              earliest_order_date: string | null;
              latest_order_date: string | null;
            }>(),

          db('products')
            .where({ store_id: storeId })
            .count('* as count')
            .first<{ count: string }>(),

          db('customers')
            .where({ store_id: storeId })
            .count('* as count')
            .first<{ count: string }>(),

          db('categories')
            .where({ store_id: storeId })
            .count('* as count')
            .first<{ count: string }>(),

          db('orders')
            .where({ store_id: storeId })
            .select('currency')
            .orderBy('date_created', 'desc')
            .first<{ currency: string } | undefined>(),
        ]);

      const context: StoreContext = {
        storeId,
        currency: currencyRow?.currency ?? 'USD',
        totalOrders: parseInt(orderStats?.total_orders ?? '0', 10),
        totalProducts: parseInt(productCount?.count ?? '0', 10),
        totalCustomers: parseInt(customerCount?.count ?? '0', 10),
        totalCategories: parseInt(categoryCount?.count ?? '0', 10),
        earliestOrderDate: orderStats?.earliest_order_date ?? null,
        latestOrderDate: orderStats?.latest_order_date ?? null,
      };

      logger.info(
        {
          storeId,
          totalOrders: context.totalOrders,
          totalProducts: context.totalProducts,
        },
        'Schema context fetched',
      );

      return context;
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new AppError(
        `Failed to fetch schema context for store ${storeId}`,
        { cause: err instanceof Error ? err : new Error(String(err)) },
      );
    }
  }

  return { getStoreContext };
}

export type SchemaContextService = ReturnType<typeof createSchemaContextService>;
