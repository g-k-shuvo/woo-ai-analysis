import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../../services/syncService.js';

interface SyncCustomersDeps {
  syncService: SyncService;
}

const syncCustomersSchema = {
  body: {
    type: 'object' as const,
    required: ['customers'],
    properties: {
      customers: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          required: ['wc_customer_id'],
          properties: {
            wc_customer_id: { type: 'integer' as const },
            email: { type: 'string' as const },
            display_name: { type: 'string' as const },
            total_spent: { type: 'number' as const },
            order_count: { type: 'integer' as const },
            first_order_date: { type: 'string' as const },
            last_order_date: { type: 'string' as const },
            created_at: { type: 'string' as const },
          },
        },
      },
    },
  },
};

export async function syncCustomersRoutes(fastify: FastifyInstance, deps: SyncCustomersDeps) {
  const { syncService } = deps;

  // POST /api/sync/customers — upsert customers batch (auth required)
  fastify.post('/api/sync/customers', { schema: syncCustomersSchema }, async (request, reply) => {
    const store = request.store!;
    const { customers } = request.body as { customers: unknown[] };

    const result = await syncService.upsertCustomers(store.id, customers);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
