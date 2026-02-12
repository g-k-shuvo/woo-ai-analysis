import type { FastifyInstance } from 'fastify';
import type { ScheduledInsightsService } from '../../services/scheduledInsightsService.js';

export interface ScheduledInsightsRoutesDeps {
  scheduledInsightsService: ScheduledInsightsService;
}

interface CreateInsightBody {
  name: string;
  frequency: string;
  hour: number;
  dayOfWeek?: number | null;
  enabled?: boolean;
}

interface UpdateInsightBody {
  name?: string;
  frequency?: string;
  hour?: number;
  dayOfWeek?: number | null;
  enabled?: boolean;
}

const createInsightSchema = {
  body: {
    type: 'object' as const,
    required: ['name', 'frequency', 'hour'],
    properties: {
      name: { type: 'string' as const, minLength: 1, maxLength: 255 },
      frequency: { type: 'string' as const, enum: ['daily', 'weekly'] },
      hour: { type: 'integer' as const, minimum: 0, maximum: 23 },
      dayOfWeek: { type: ['integer', 'null'] as const, minimum: 0, maximum: 6 },
      enabled: { type: 'boolean' as const },
    },
  },
};

const updateInsightSchema = {
  body: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' as const, minLength: 1, maxLength: 255 },
      frequency: { type: 'string' as const, enum: ['daily', 'weekly'] },
      hour: { type: 'integer' as const, minimum: 0, maximum: 23 },
      dayOfWeek: { type: ['integer', 'null'] as const, minimum: 0, maximum: 6 },
      enabled: { type: 'boolean' as const },
    },
  },
  params: {
    type: 'object' as const,
    required: ['id'],
    properties: {
      id: {
        type: 'string' as const,
        pattern: '^[0-9a-fA-F-]{1,64}$',
      },
    },
  },
};

const insightIdParamsSchema = {
  params: {
    type: 'object' as const,
    required: ['id'],
    properties: {
      id: {
        type: 'string' as const,
        pattern: '^[0-9a-fA-F-]{1,64}$',
      },
    },
  },
};

export async function scheduledInsightsRoutes(
  fastify: FastifyInstance,
  deps: ScheduledInsightsRoutesDeps,
) {
  const { scheduledInsightsService } = deps;

  // POST /api/scheduled-insights — create a new scheduled insight
  fastify.post<{ Body: CreateInsightBody }>(
    '/api/scheduled-insights',
    { schema: createInsightSchema },
    async (request, reply) => {
      const store = request.store!;
      const { name, frequency, hour, dayOfWeek, enabled } = request.body;

      const insight = await scheduledInsightsService.createInsight(store.id, {
        name,
        frequency,
        hour,
        dayOfWeek,
        enabled,
      });

      return reply.status(201).send({
        success: true,
        data: insight,
      });
    },
  );

  // GET /api/scheduled-insights — list all scheduled insights for the store
  fastify.get('/api/scheduled-insights', async (request, reply) => {
    const store = request.store!;
    const insights = await scheduledInsightsService.listInsights(store.id);

    return reply.status(200).send({
      success: true,
      data: { insights },
    });
  });

  // PUT /api/scheduled-insights/:id — update a scheduled insight
  fastify.put<{ Params: { id: string }; Body: UpdateInsightBody }>(
    '/api/scheduled-insights/:id',
    { schema: updateInsightSchema },
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;
      const { name, frequency, hour, dayOfWeek, enabled } = request.body;

      const insight = await scheduledInsightsService.updateInsight(store.id, id, {
        name,
        frequency,
        hour,
        dayOfWeek,
        enabled,
      });

      return reply.status(200).send({
        success: true,
        data: insight,
      });
    },
  );

  // DELETE /api/scheduled-insights/:id — delete a scheduled insight
  fastify.delete<{ Params: { id: string } }>(
    '/api/scheduled-insights/:id',
    { schema: insightIdParamsSchema },
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;

      await scheduledInsightsService.deleteInsight(store.id, id);

      return reply.status(200).send({
        success: true,
        data: { deleted: true },
      });
    },
  );
}
