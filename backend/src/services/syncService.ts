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

export interface UpsertOrdersResult {
  syncedCount: number;
  skippedCount: number;
  syncLogId: string;
}

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

  async function upsertOrders(storeId: string, orders: unknown[]): Promise<UpsertOrdersResult> {
    if (!Array.isArray(orders)) {
      throw new ValidationError('orders must be an array');
    }

    // Create sync log entry
    const [syncLog] = await db('sync_logs')
      .insert({
        store_id: storeId,
        sync_type: 'orders',
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

  return {
    upsertOrders,
  };
}

export type SyncService = ReturnType<typeof createSyncService>;
