import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../../services/syncService.js';

interface SyncOrdersDeps {
  syncService: SyncService;
}

const syncOrdersSchema = {
  body: {
    type: 'object' as const,
    required: ['orders'],
    properties: {
      orders: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          required: ['wc_order_id', 'date_created', 'status', 'total'],
          properties: {
            wc_order_id: { type: 'integer' as const },
            date_created: { type: 'string' as const, minLength: 1 },
            date_modified: { type: 'string' as const },
            status: { type: 'string' as const, minLength: 1 },
            total: { type: 'number' as const },
            subtotal: { type: 'number' as const },
            tax_total: { type: 'number' as const },
            shipping_total: { type: 'number' as const },
            discount_total: { type: 'number' as const },
            currency: { type: 'string' as const },
            customer_id: { type: 'integer' as const },
            payment_method: { type: 'string' as const },
            coupon_used: { type: 'string' as const },
            items: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                required: ['product_name', 'quantity'],
                properties: {
                  wc_product_id: { type: 'integer' as const },
                  product_name: { type: 'string' as const, minLength: 1 },
                  sku: { type: 'string' as const },
                  quantity: { type: 'integer' as const, minimum: 1 },
                  subtotal: { type: 'number' as const },
                  total: { type: 'number' as const },
                },
              },
            },
          },
        },
      },
    },
  },
};

export async function syncOrdersRoutes(fastify: FastifyInstance, deps: SyncOrdersDeps) {
  const { syncService } = deps;

  // POST /api/sync/orders — upsert orders batch (auth required)
  fastify.post('/api/sync/orders', { schema: syncOrdersSchema }, async (request, reply) => {
    const store = request.store!;
    const { orders } = request.body as { orders: unknown[] };

    const result = await syncService.upsertOrders(store.id, orders);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
