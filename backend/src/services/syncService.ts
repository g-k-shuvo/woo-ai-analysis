import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { ValidationError, SyncError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface OrderItemPayload {
  wc_product_id?: number;
  product_name: string;
  sku?: string;
  quantity: number;
  subtotal?: number;
  total?: number;
}

export interface OrderPayload {
  wc_order_id: number;
  date_created: string;
  date_modified?: string;
  status: string;
  total: number;
  subtotal?: number;
  tax_total?: number;
  shipping_total?: number;
  discount_total?: number;
  currency?: string;
  customer_id?: number;
  payment_method?: string;
  coupon_used?: string;
  items?: OrderItemPayload[];
}

export interface ProductPayload {
  wc_product_id: number;
  name: string;
  sku?: string;
  price?: number;
  regular_price?: number;
  sale_price?: number;
  category_id?: number;
  category_name?: string;
  stock_quantity?: number;
  stock_status?: string;
  status?: string;
  type?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerPayload {
  wc_customer_id: number;
  email?: string;
  display_name?: string;
  total_spent?: number;
  order_count?: number;
  first_order_date?: string;
  last_order_date?: string;
  created_at?: string;
}

export interface CategoryPayload {
  wc_category_id: number;
  name: string;
  parent_id?: number;
  product_count?: number;
}

export interface UpsertResult {
  syncedCount: number;
  skippedCount: number;
  syncLogId: string;
}

export type UpsertOrdersResult = UpsertResult;

export interface SyncServiceDeps {
  db: Knex;
}

function validateOrder(order: unknown): order is OrderPayload {
  if (!order || typeof order !== 'object') return false;
  const o = order as Record<string, unknown>;
  if (typeof o.wc_order_id !== 'number' || !Number.isInteger(o.wc_order_id)) return false;
  if (typeof o.date_created !== 'string' || !o.date_created) return false;
  if (typeof o.status !== 'string' || !o.status) return false;
  if (typeof o.total !== 'number') return false;
  return true;
}

function validateProduct(product: unknown): product is ProductPayload {
  if (!product || typeof product !== 'object') return false;
  const p = product as Record<string, unknown>;
  if (typeof p.wc_product_id !== 'number' || !Number.isInteger(p.wc_product_id)) return false;
  if (typeof p.name !== 'string' || !p.name.trim()) return false;
  return true;
}

function validateCustomer(customer: unknown): customer is CustomerPayload {
  if (!customer || typeof customer !== 'object') return false;
  const c = customer as Record<string, unknown>;
  if (typeof c.wc_customer_id !== 'number' || !Number.isInteger(c.wc_customer_id)) return false;
  return true;
}

function validateCategory(category: unknown): category is CategoryPayload {
  if (!category || typeof category !== 'object') return false;
  const c = category as Record<string, unknown>;
  if (typeof c.wc_category_id !== 'number' || !Number.isInteger(c.wc_category_id)) return false;
  if (typeof c.name !== 'string' || !c.name.trim()) return false;
  return true;
}

function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

async function fetchIdsToMap(
  trx: Knex.Transaction,
  table: string,
  storeId: string,
  wcIdColumn: string,
  wcIds: number[],
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (wcIds.length === 0) return map;

  const rows = await trx(table)
    .select('id', wcIdColumn)
    .where({ store_id: storeId })
    .whereIn(wcIdColumn, wcIds);

  for (const row of rows) {
    map.set(row[wcIdColumn], row.id);
  }
  return map;
}

export function createSyncService(deps: SyncServiceDeps) {
  const { db } = deps;

  async function upsertOrders(storeId: string, orders: unknown[], syncType = 'orders'): Promise<UpsertOrdersResult> {
    if (!Array.isArray(orders)) {
      throw new ValidationError('orders must be an array');
    }

    // Create sync log entry
    const [syncLog] = await db('sync_logs')
      .insert({
        store_id: storeId,
        sync_type: syncType,
        status: 'running',
        records_synced: 0,
      })
      .returning('id');

    const syncLogId: string = syncLog.id;

    if (orders.length === 0) {
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: 0,
        completed_at: db.fn.now(),
      });

      return { syncedCount: 0, skippedCount: 0, syncLogId };
    }

    // Separate valid orders from invalid ones
    const validOrders: OrderPayload[] = [];
    let skippedCount = 0;

    for (const rawOrder of orders) {
      if (!validateOrder(rawOrder)) {
        skippedCount++;
        logger.warn({ storeId, order: rawOrder }, 'Skipping invalid order: missing required fields');
        continue;
      }
      validOrders.push(rawOrder);
    }

    if (validOrders.length === 0) {
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: 0,
        completed_at: db.fn.now(),
      });

      return { syncedCount: 0, skippedCount, syncLogId };
    }

    let syncedCount = 0;

    const trx = await db.transaction();
    try {
      // Batch-fetch customer and product UUIDs to avoid N+1 queries
      const customerWcIds = validOrders
        .map((o) => o.customer_id)
        .filter((id): id is number => !!id && id > 0);
      const productWcIds = validOrders
        .flatMap((o) => o.items ?? [])
        .map((item) => item.wc_product_id)
        .filter((id): id is number => !!id);
      const uniqueProductWcIds = [...new Set(productWcIds)];

      const customerMap = await fetchIdsToMap(trx, 'customers', storeId, 'wc_customer_id', [...new Set(customerWcIds)]);
      const productMap = await fetchIdsToMap(trx, 'products', storeId, 'wc_product_id', uniqueProductWcIds);

      for (const order of validOrders) {
        const customerUuid = order.customer_id && order.customer_id > 0
          ? customerMap.get(order.customer_id) ?? null
          : null;

        // Upsert order
        const [upsertedOrder] = await trx('orders')
          .insert({
            store_id: storeId,
            wc_order_id: order.wc_order_id,
            date_created: order.date_created,
            date_modified: order.date_modified ?? null,
            status: order.status,
            total: order.total,
            subtotal: order.subtotal ?? null,
            tax_total: order.tax_total ?? null,
            shipping_total: order.shipping_total ?? null,
            discount_total: order.discount_total ?? null,
            currency: order.currency ?? 'USD',
            customer_id: customerUuid,
            payment_method: order.payment_method ?? null,
            coupon_used: order.coupon_used ?? null,
          })
          .onConflict(['store_id', 'wc_order_id'])
          .merge()
          .returning('id');

        const orderId: string = upsertedOrder.id;

        // Replace order items: delete old, insert new
        await trx('order_items').where({ order_id: orderId, store_id: storeId }).del();

        if (order.items && order.items.length > 0) {
          const itemRows = order.items.map((item) => ({
            order_id: orderId,
            store_id: storeId,
            product_id: item.wc_product_id ? productMap.get(item.wc_product_id) ?? null : null,
            product_name: item.product_name,
            sku: item.sku ?? null,
            quantity: item.quantity,
            subtotal: item.subtotal ?? null,
            total: item.total ?? null,
          }));

          await trx('order_items').insert(itemRows);
        }

        syncedCount++;
      }

      // Update store.last_sync_at
      await trx('stores').where({ id: storeId }).update({
        last_sync_at: trx.fn.now(),
      });

      await trx.commit();

      // Update sync log
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: syncedCount,
        completed_at: db.fn.now(),
      });

      logger.info({ storeId, syncedCount, skippedCount, syncLogId }, 'Orders sync completed');

      return { syncedCount, skippedCount, syncLogId };
    } catch (err) {
      await trx.rollback();

      // Mark sync log as failed
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
        completed_at: db.fn.now(),
      });

      throw new SyncError('Failed to upsert orders', { cause: err instanceof Error ? err : undefined });
    }
  }

  async function upsertProducts(storeId: string, products: unknown[], syncType = 'products'): Promise<UpsertResult> {
    if (!Array.isArray(products)) {
      throw new ValidationError('products must be an array');
    }

    const [syncLog] = await db('sync_logs')
      .insert({
        store_id: storeId,
        sync_type: syncType,
        status: 'running',
        records_synced: 0,
      })
      .returning('id');

    const syncLogId: string = syncLog.id;

    if (products.length === 0) {
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: 0,
        completed_at: db.fn.now(),
      });

      return { syncedCount: 0, skippedCount: 0, syncLogId };
    }

    const validProducts: ProductPayload[] = [];
    let skippedCount = 0;

    for (const raw of products) {
      if (!validateProduct(raw)) {
        skippedCount++;
        logger.warn({ storeId, product: raw }, 'Skipping invalid product: missing required fields');
        continue;
      }
      validProducts.push(raw);
    }

    if (validProducts.length === 0) {
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: 0,
        completed_at: db.fn.now(),
      });

      return { syncedCount: 0, skippedCount, syncLogId };
    }

    let syncedCount = 0;

    const trx = await db.transaction();
    try {
      // Batch-fetch category UUIDs to resolve category_id references.
      // WooCommerce uses category_id=0 to mean "uncategorized", so we skip 0.
      const categoryWcIds = validProducts
        .map((p) => p.category_id)
        .filter((id): id is number => !!id && id > 0);
      const categoryMap = await fetchIdsToMap(trx, 'categories', storeId, 'wc_category_id', [...new Set(categoryWcIds)]);

      for (const product of validProducts) {
        // category_id=0 means "uncategorized" in WooCommerce — treat as null
        const categoryUuid = product.category_id && product.category_id > 0
          ? categoryMap.get(product.category_id) ?? null
          : null;

        await trx('products')
          .insert({
            store_id: storeId,
            wc_product_id: product.wc_product_id,
            name: product.name,
            sku: product.sku ?? null,
            price: product.price ?? null,
            regular_price: product.regular_price ?? null,
            sale_price: product.sale_price ?? null,
            category_id: categoryUuid,
            category_name: product.category_name ?? null,
            stock_quantity: product.stock_quantity ?? null,
            stock_status: product.stock_status ?? null,
            status: product.status ?? 'publish',
            type: product.type ?? 'simple',
            created_at: product.created_at ?? null,
            updated_at: product.updated_at ?? null,
          })
          .onConflict(['store_id', 'wc_product_id'])
          .merge();

        syncedCount++;
      }

      await trx('stores').where({ id: storeId }).update({
        last_sync_at: trx.fn.now(),
      });

      await trx.commit();

      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: syncedCount,
        completed_at: db.fn.now(),
      });

      logger.info({ storeId, syncedCount, skippedCount, syncLogId }, 'Products sync completed');

      return { syncedCount, skippedCount, syncLogId };
    } catch (err) {
      await trx.rollback();

      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
        completed_at: db.fn.now(),
      });

      throw new SyncError('Failed to upsert products', { cause: err instanceof Error ? err : undefined });
    }
  }

  async function upsertCustomers(storeId: string, customers: unknown[], syncType = 'customers'): Promise<UpsertResult> {
    if (!Array.isArray(customers)) {
      throw new ValidationError('customers must be an array');
    }

    const [syncLog] = await db('sync_logs')
      .insert({
        store_id: storeId,
        sync_type: syncType,
        status: 'running',
        records_synced: 0,
      })
      .returning('id');

    const syncLogId: string = syncLog.id;

    if (customers.length === 0) {
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: 0,
        completed_at: db.fn.now(),
      });

      return { syncedCount: 0, skippedCount: 0, syncLogId };
    }

    const validCustomers: CustomerPayload[] = [];
    let skippedCount = 0;

    for (const raw of customers) {
      if (!validateCustomer(raw)) {
        skippedCount++;
        logger.warn({ storeId, customer: raw }, 'Skipping invalid customer: missing required fields');
        continue;
      }
      validCustomers.push(raw);
    }

    if (validCustomers.length === 0) {
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: 0,
        completed_at: db.fn.now(),
      });

      return { syncedCount: 0, skippedCount, syncLogId };
    }

    let syncedCount = 0;

    const trx = await db.transaction();
    try {
      for (const customer of validCustomers) {
        const emailHash = customer.email ? hashEmail(customer.email) : null;

        await trx('customers')
          .insert({
            store_id: storeId,
            wc_customer_id: customer.wc_customer_id,
            email_hash: emailHash,
            display_name: customer.display_name ?? null,
            total_spent: customer.total_spent ?? 0,
            order_count: customer.order_count ?? 0,
            first_order_date: customer.first_order_date ?? null,
            last_order_date: customer.last_order_date ?? null,
            created_at: customer.created_at ?? null,
          })
          .onConflict(['store_id', 'wc_customer_id'])
          .merge();

        syncedCount++;
      }

      await trx('stores').where({ id: storeId }).update({
        last_sync_at: trx.fn.now(),
      });

      await trx.commit();

      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: syncedCount,
        completed_at: db.fn.now(),
      });

      logger.info({ storeId, syncedCount, skippedCount, syncLogId }, 'Customers sync completed');

      return { syncedCount, skippedCount, syncLogId };
    } catch (err) {
      await trx.rollback();

      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
        completed_at: db.fn.now(),
      });

      throw new SyncError('Failed to upsert customers', { cause: err instanceof Error ? err : undefined });
    }
  }

  async function upsertCategories(storeId: string, categories: unknown[], syncType = 'categories'): Promise<UpsertResult> {
    if (!Array.isArray(categories)) {
      throw new ValidationError('categories must be an array');
    }

    const [syncLog] = await db('sync_logs')
      .insert({
        store_id: storeId,
        sync_type: syncType,
        status: 'running',
        records_synced: 0,
      })
      .returning('id');

    const syncLogId: string = syncLog.id;

    if (categories.length === 0) {
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: 0,
        completed_at: db.fn.now(),
      });

      return { syncedCount: 0, skippedCount: 0, syncLogId };
    }

    const validCategories: CategoryPayload[] = [];
    let skippedCount = 0;

    for (const raw of categories) {
      if (!validateCategory(raw)) {
        skippedCount++;
        logger.warn({ storeId, category: raw }, 'Skipping invalid category: missing required fields');
        continue;
      }
      validCategories.push(raw);
    }

    if (validCategories.length === 0) {
      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: 0,
        completed_at: db.fn.now(),
      });

      return { syncedCount: 0, skippedCount, syncLogId };
    }

    let syncedCount = 0;

    const trx = await db.transaction();
    try {
      // Batch-fetch parent category UUIDs to resolve parent_id references.
      // WooCommerce uses parent_id=0 to mean "root category" (no parent), so we skip 0.
      const parentWcIds = validCategories
        .map((c) => c.parent_id)
        .filter((id): id is number => !!id && id > 0);
      const parentMap = await fetchIdsToMap(trx, 'categories', storeId, 'wc_category_id', [...new Set(parentWcIds)]);

      for (const category of validCategories) {
        // parent_id=0 means "root category" in WooCommerce — treat as null
        const parentUuid = category.parent_id && category.parent_id > 0
          ? parentMap.get(category.parent_id) ?? null
          : null;

        await trx('categories')
          .insert({
            store_id: storeId,
            wc_category_id: category.wc_category_id,
            name: category.name,
            parent_id: parentUuid,
            product_count: category.product_count ?? 0,
          })
          .onConflict(['store_id', 'wc_category_id'])
          .merge();

        syncedCount++;
      }

      await trx('stores').where({ id: storeId }).update({
        last_sync_at: trx.fn.now(),
      });

      await trx.commit();

      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'completed',
        records_synced: syncedCount,
        completed_at: db.fn.now(),
      });

      logger.info({ storeId, syncedCount, skippedCount, syncLogId }, 'Categories sync completed');

      return { syncedCount, skippedCount, syncLogId };
    } catch (err) {
      await trx.rollback();

      await db('sync_logs').where({ id: syncLogId, store_id: storeId }).update({
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown error',
        completed_at: db.fn.now(),
      });

      throw new SyncError('Failed to upsert categories', { cause: err instanceof Error ? err : undefined });
    }
  }

  return {
    upsertOrders,
    upsertProducts,
    upsertCustomers,
    upsertCategories,
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
