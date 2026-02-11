import type { FastifyInstance } from 'fastify';
import type { StoreService } from '../services/storeService.js';

interface StoreDeps {
  storeService: StoreService;
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
  const { storeService } = deps;

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
}
