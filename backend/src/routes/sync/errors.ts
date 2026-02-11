import type { FastifyInstance } from 'fastify';
import type { SyncRetryService } from '../../services/syncRetryService.js';

interface SyncErrorsDeps {
  syncRetryService: SyncRetryService;
}

const retryParamsSchema = {
  params: {
    type: 'object' as const,
    required: ['syncLogId'],
    properties: {
      syncLogId: { type: 'string' as const },
    },
  },
};

interface RetryParams {
  syncLogId: string;
}

export async function syncErrorsRoutes(fastify: FastifyInstance, deps: SyncErrorsDeps) {
  const { syncRetryService } = deps;

  // GET /api/sync/errors — list failed/retryable syncs for the authenticated store
  fastify.get('/api/sync/errors', async (request, reply) => {
    const store = request.store!;

    const failedSyncs = await syncRetryService.getFailedSyncs(store.id);

    return reply.status(200).send({
      success: true,
      data: {
        failedSyncs,
      },
    });
  });

  // POST /api/sync/retry/:syncLogId — manually schedule retry for a specific failed sync
  fastify.post<{ Params: RetryParams }>(
    '/api/sync/retry/:syncLogId',
    { schema: retryParamsSchema },
    async (request, reply) => {
      const store = request.store!;
      const { syncLogId } = request.params;

      const result = await syncRetryService.scheduleRetry(store.id, syncLogId);

      return reply.status(200).send({
        success: true,
        data: result,
      });
    },
  );
}
