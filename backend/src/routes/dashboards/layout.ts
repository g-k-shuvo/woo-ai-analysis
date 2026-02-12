import type { FastifyInstance } from 'fastify';
import type { DashboardLayoutService } from '../../services/dashboardLayoutService.js';

export interface DashboardLayoutDeps {
  dashboardLayoutService: DashboardLayoutService;
}

interface UpdateGridLayoutBody {
  items: Array<{
    id: string;
    gridX: number;
    gridY: number;
    gridW: number;
    gridH: number;
  }>;
}

const updateGridLayoutSchema = {
  body: {
    type: 'object' as const,
    required: ['items'],
    properties: {
      items: {
        type: 'array' as const,
        minItems: 1,
        items: {
          type: 'object' as const,
          required: ['id', 'gridX', 'gridY', 'gridW', 'gridH'],
          properties: {
            id: { type: 'string' as const },
            gridX: { type: 'integer' as const, minimum: 0 },
            gridY: { type: 'integer' as const, minimum: 0 },
            gridW: { type: 'integer' as const, minimum: 3, maximum: 12 },
            gridH: { type: 'integer' as const, minimum: 2, maximum: 8 },
          },
        },
      },
    },
  },
};

export async function dashboardLayoutRoutes(
  fastify: FastifyInstance,
  deps: DashboardLayoutDeps,
) {
  const { dashboardLayoutService } = deps;

  // PUT /api/dashboards/grid-layout — update grid positions for all charts
  fastify.put<{ Body: UpdateGridLayoutBody }>(
    '/api/dashboards/grid-layout',
    { schema: updateGridLayoutSchema },
    async (request, reply) => {
      const store = request.store!;
      const { items } = request.body;

      await dashboardLayoutService.updateGridLayout(store.id, items);

      return reply.status(200).send({
        success: true,
        data: { updated: true },
      });
    },
  );
}
