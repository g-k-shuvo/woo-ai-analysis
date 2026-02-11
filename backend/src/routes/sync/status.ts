import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../../services/syncService.js';

interface SyncStatusDeps {
  syncService: SyncService;
}

export async function syncStatusRoutes(fastify: FastifyInstance, deps: SyncStatusDeps) {
  const { syncService } = deps;

  // GET /api/sync/status — get sync health for the authenticated store
  fastify.get('/api/sync/status', async (request, reply) => {
    const store = request.store!;

    const status = await syncService.getSyncStatus(store.id);

    return reply.status(200).send({
      success: true,
      data: status,
    });
  });
}
