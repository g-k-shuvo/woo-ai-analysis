import type { FastifyInstance } from 'fastify';
import type { SavedChartsService } from '../../services/savedChartsService.js';

export interface DashboardChartsDeps {
  savedChartsService: SavedChartsService;
}

const saveChartSchema = {
  body: {
    type: 'object' as const,
    required: ['title', 'chartConfig'],
    properties: {
      title: { type: 'string' as const, minLength: 1, maxLength: 255 },
      queryText: { type: 'string' as const, maxLength: 2000 },
      chartConfig: { type: 'object' as const },
    },
  },
};

const updateChartSchema = {
  body: {
    type: 'object' as const,
    properties: {
      title: { type: 'string' as const, minLength: 1, maxLength: 255 },
      chartConfig: { type: 'object' as const },
    },
  },
};

const updateLayoutSchema = {
  body: {
    type: 'object' as const,
    required: ['positions'],
    properties: {
      positions: {
        type: 'array' as const,
        minItems: 1,
        items: {
          type: 'object' as const,
          required: ['id', 'positionIndex'],
          properties: {
            id: { type: 'string' as const },
            positionIndex: { type: 'integer' as const, minimum: 0 },
          },
        },
      },
    },
  },
};

export async function dashboardChartsRoutes(
  fastify: FastifyInstance,
  deps: DashboardChartsDeps,
) {
  const { savedChartsService } = deps;

  // POST /api/dashboards/charts — save a new chart
  fastify.post('/api/dashboards/charts', { schema: saveChartSchema }, async (request, reply) => {
    const store = request.store!;
    const { title, queryText, chartConfig } = request.body as {
      title: string;
      queryText?: string;
      chartConfig: Record<string, unknown>;
    };

    const chart = await savedChartsService.saveChart(store.id, {
      title,
      queryText,
      chartConfig,
    });

    return reply.status(201).send({
      success: true,
      data: chart,
    });
  });

  // GET /api/dashboards/charts — list all saved charts
  fastify.get('/api/dashboards/charts', async (request, reply) => {
    const store = request.store!;
    const charts = await savedChartsService.listCharts(store.id);

    return reply.status(200).send({
      success: true,
      data: { charts },
    });
  });

  // PUT /api/dashboards/charts/:id — update a saved chart
  fastify.put<{ Params: { id: string } }>(
    '/api/dashboards/charts/:id',
    { schema: updateChartSchema },
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;
      const { title, chartConfig } = request.body as {
        title?: string;
        chartConfig?: Record<string, unknown>;
      };

      const chart = await savedChartsService.updateChart(store.id, id, {
        title,
        chartConfig,
      });

      return reply.status(200).send({
        success: true,
        data: chart,
      });
    },
  );

  // DELETE /api/dashboards/charts/:id — delete a saved chart
  fastify.delete<{ Params: { id: string } }>(
    '/api/dashboards/charts/:id',
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;

      await savedChartsService.deleteChart(store.id, id);

      return reply.status(200).send({
        success: true,
        data: { deleted: true },
      });
    },
  );

  // PUT /api/dashboards/layout — reorder charts
  fastify.put('/api/dashboards/layout', { schema: updateLayoutSchema }, async (request, reply) => {
    const store = request.store!;
    const { positions } = request.body as {
      positions: Array<{ id: string; positionIndex: number }>;
    };

    await savedChartsService.updateLayout(store.id, positions);

    return reply.status(200).send({
      success: true,
      data: { updated: true },
    });
  });
}
