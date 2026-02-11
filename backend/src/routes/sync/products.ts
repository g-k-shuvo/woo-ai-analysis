import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../../services/syncService.js';

interface SyncProductsDeps {
  syncService: SyncService;
}

const syncProductsSchema = {
  body: {
    type: 'object' as const,
    required: ['products'],
    properties: {
      products: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          required: ['wc_product_id', 'name'],
          properties: {
            wc_product_id: { type: 'integer' as const },
            name: { type: 'string' as const, minLength: 1 },
            sku: { type: 'string' as const },
            price: { type: 'number' as const },
            regular_price: { type: 'number' as const },
            sale_price: { type: 'number' as const },
            category_id: { type: 'integer' as const },
            category_name: { type: 'string' as const },
            stock_quantity: { type: 'integer' as const },
            stock_status: { type: 'string' as const },
            status: { type: 'string' as const },
            type: { type: 'string' as const },
            created_at: { type: 'string' as const },
            updated_at: { type: 'string' as const },
          },
        },
      },
    },
  },
};

export async function syncProductsRoutes(fastify: FastifyInstance, deps: SyncProductsDeps) {
  const { syncService } = deps;

  // POST /api/sync/products — upsert products batch (auth required)
  fastify.post('/api/sync/products', { schema: syncProductsSchema }, async (request, reply) => {
    const store = request.store!;
    const { products } = request.body as { products: unknown[] };

    const result = await syncService.upsertProducts(store.id, products);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
