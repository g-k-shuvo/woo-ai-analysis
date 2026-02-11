/**
 * Schema context service — fetches store-specific metadata from the database
 * for injection into the AI system prompt.
 *
 * Every DB query MUST include WHERE store_id = ? for tenant isolation.
 */

import type { Knex } from 'knex';
import { logger } from '../utils/logger.js';

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
    const [orderStats, productCount, customerCount, categoryCount] =
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
      ]);

    // Fetch the primary currency from the most recent order
    const currencyRow = await db('orders')
      .where({ store_id: storeId })
      .select('currency')
      .orderBy('date_created', 'desc')
      .first<{ currency: string } | undefined>();

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
  }

  return { getStoreContext };
}

export type SchemaContextService = ReturnType<typeof createSchemaContextService>;
