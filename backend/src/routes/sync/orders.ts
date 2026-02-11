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
        items: { type: 'object' as const },
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
