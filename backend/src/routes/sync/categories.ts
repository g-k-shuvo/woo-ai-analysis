import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../../services/syncService.js';

interface SyncCategoriesDeps {
  syncService: SyncService;
}

const syncCategoriesSchema = {
  body: {
    type: 'object' as const,
    required: ['categories'],
    properties: {
      categories: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          required: ['wc_category_id', 'name'],
          properties: {
            wc_category_id: { type: 'integer' as const },
            name: { type: 'string' as const, minLength: 1 },
            parent_id: { type: 'integer' as const },
            product_count: { type: 'integer' as const },
          },
        },
      },
    },
  },
};

export async function syncCategoriesRoutes(fastify: FastifyInstance, deps: SyncCategoriesDeps) {
  const { syncService } = deps;

  // POST /api/sync/categories — upsert categories batch (auth required)
  fastify.post('/api/sync/categories', { schema: syncCategoriesSchema }, async (request, reply) => {
    const store = request.store!;
    const { categories } = request.body as { categories: unknown[] };

    const result = await syncService.upsertCategories(store.id, categories);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
