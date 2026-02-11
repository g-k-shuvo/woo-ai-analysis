# Data Sync — Deep Reference

## Sync Types

### 1. Initial Full Sync
Triggered when a store first connects. Syncs ALL existing data.

**Flow:**
1. Plugin reads total count of each entity (orders, products, customers)
2. Plugin sends counts to backend, backend shows "Syncing X records..."
3. Plugin reads data in batches of 100 records
4. Each batch is POST'd to `/api/sync/{entity}`
5. Backend upserts records (insert if new, update if exists via `ON CONFLICT`)
6. Progress is tracked in `sync_logs` table
7. Plugin polls `/api/sync/status` to show progress bar in WP admin

**Order of sync:** Categories → Products → Customers → Orders → Order Items → Coupons

**Performance:** Use direct DB queries with `$wpdb` for speed (not REST API).
Must be HPOS-compatible: query `wp_wc_orders` table, not `wp_posts`.

### 2. Incremental Sync (Real-time)
After initial sync, WooCommerce webhooks push changes in real-time.

**Registered Webhooks:**
| WC Hook | Our Handler | Backend Endpoint |
|---------|-------------|-----------------|
| `woocommerce_new_order` | `on_new_order()` | `POST /api/sync/orders` |
| `woocommerce_update_order` | `on_update_order()` | `POST /api/sync/orders` |
| `woocommerce_order_status_changed` | `on_status_change()` | `POST /api/sync/orders` |
| `woocommerce_new_product` | `on_new_product()` | `POST /api/sync/products` |
| `woocommerce_update_product` | `on_update_product()` | `POST /api/sync/products` |
| `woocommerce_created_customer` | `on_new_customer()` | `POST /api/sync/customers` |

**Webhook payload:** Transform WC data to our sync format before sending.

### 3. Scheduled Re-sync (Fallback)
WP Cron runs every 6 hours to catch any missed webhooks:
- Compare record counts (local WC vs backend)
- If mismatch, do a targeted incremental sync for the affected entity
- Log discrepancies for debugging

## Data Transformation

### Order Transformation (WC → Sync Payload)
```php
function transform_order(WC_Order $order): array {
    return [
        'wc_order_id'    => $order->get_id(),
        'date_created'   => $order->get_date_created()->format('c'), // ISO 8601 UTC
        'date_modified'  => $order->get_date_modified()?->format('c'),
        'status'         => $order->get_status(),
        'total'          => (float) $order->get_total(),
        'subtotal'       => (float) $order->get_subtotal(),
        'tax_total'      => (float) $order->get_total_tax(),
        'shipping_total' => (float) $order->get_shipping_total(),
        'discount_total' => (float) $order->get_discount_total(),
        'currency'       => $order->get_currency(),
        'customer_id'    => $order->get_customer_id(),
        'payment_method' => $order->get_payment_method(),
        'coupon_used'    => implode(',', $order->get_coupon_codes()),
        'items'          => array_map([$this, 'transform_order_item'], $order->get_items()),
    ];
}
```

### Customer PII Rules
- **email**: Hash with SHA256 before syncing. Never send plaintext.
- **name**: Send `display_name` only (not billing/shipping names)
- **address**: Never sync addresses
- **phone**: Never sync phone numbers

## Backend Upsert Pattern

```typescript
async function upsertOrders(storeId: string, orders: OrderPayload[]) {
  const trx = await db.transaction();
  try {
    for (const order of orders) {
      await trx('orders')
        .insert({
          store_id: storeId,
          wc_order_id: order.wc_order_id,
          date_created: order.date_created,
          // ... all fields
        })
        .onConflict(['store_id', 'wc_order_id'])
        .merge(); // Update if exists
    }
    
    await trx('sync_logs').insert({
      store_id: storeId,
      sync_type: 'orders',
      records_synced: orders.length,
      status: 'completed',
      completed_at: new Date(),
    });
    
    await trx.commit();
  } catch (err) {
    await trx.rollback();
    throw new SyncError('Failed to upsert orders', { cause: err });
  }
}
```

## Error Handling
- Network failures: Retry 3 times with exponential backoff (1s, 4s, 16s)
- Invalid data: Log error, skip record, continue sync (don't fail entire batch)
- Rate limits: Back off and retry after the specified delay
- Auth failures: Mark store as disconnected, notify admin in WP
