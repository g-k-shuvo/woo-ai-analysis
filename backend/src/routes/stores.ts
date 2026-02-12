import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import type { StoreService } from '../services/storeService.js';

interface StoreDeps {
  storeService: StoreService;
  db: Knex;
}

const connectSchema = {
  body: {
    type: 'object' as const,
    required: ['storeUrl', 'apiKey'],
    properties: {
      storeUrl: { type: 'string' as const },
      apiKey: { type: 'string' as const, minLength: 32 },
      wcVersion: { type: 'string' as const },
    },
  },
};

export async function storeRoutes(fastify: FastifyInstance, deps: StoreDeps) {
  const { storeService, db } = deps;

  // POST /api/stores/connect — register a new store (no auth required)
  fastify.post('/api/stores/connect', { schema: connectSchema }, async (request, reply) => {
    const { storeUrl, apiKey, wcVersion } = request.body as {
      storeUrl: string;
      apiKey: string;
      wcVersion?: string;
    };

    const result = await storeService.connectStore({
      storeUrl,
      apiKey,
      wcVersion,
    });

    return reply.status(201).send({
      success: true,
      data: { storeId: result.storeId },
    });
  });

  // GET /api/stores/status — check connection status (auth required)
  fastify.get('/api/stores/status', async (request, reply) => {
    const store = request.store!;

    const status = await storeService.getStoreStatus(store.id);

    return reply.status(200).send({
      success: true,
      data: status,
    });
  });

  // DELETE /api/stores/disconnect — disconnect and delete all data (auth required)
  fastify.delete('/api/stores/disconnect', async (request, reply) => {
    const store = request.store!;

    await storeService.disconnectStore(store.id);

    return reply.status(200).send({
      success: true,
      data: { message: 'Store disconnected and all data deleted.' },
    });
  });

  // GET /api/stores/onboarding-status — check onboarding readiness (auth required)
  fastify.get('/api/stores/onboarding-status', async (request, reply) => {
    const store = request.store!;

    const [ordersCount, productsCount, customersCount, categoriesCount] = await Promise.all([
      db('orders').where({ store_id: store.id }).count('* as count').first<{ count: string }>(),
      db('products').where({ store_id: store.id }).count('* as count').first<{ count: string }>(),
      db('customers').where({ store_id: store.id }).count('* as count').first<{ count: string }>(),
      db('categories').where({ store_id: store.id }).count('* as count').first<{ count: string }>(),
    ]);

    const counts = {
      orders: parseInt(ordersCount?.count ?? '0', 10),
      products: parseInt(productsCount?.count ?? '0', 10),
      customers: parseInt(customersCount?.count ?? '0', 10),
      categories: parseInt(categoriesCount?.count ?? '0', 10),
    };

    const hasSyncedData = counts.orders > 0 || counts.products > 0 || counts.customers > 0;

    return reply.status(200).send({
      success: true,
      data: {
        connected: true,
        hasSyncedData,
        recordCounts: counts,
      },
    });
  });
}
