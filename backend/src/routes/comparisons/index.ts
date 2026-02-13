import type { FastifyInstance } from 'fastify';
import type { DateComparisonService } from '../../services/dateComparisonService.js';

export interface ComparisonRoutesDeps {
  dateComparisonService: DateComparisonService;
}

const VALID_PRESETS = ['today', 'this_week', 'this_month', 'this_year', 'last_7_days', 'last_30_days'];

const generateComparisonSchema = {
  body: {
    type: 'object' as const,
    oneOf: [
      {
        required: ['preset'],
        properties: {
          preset: { type: 'string' as const, enum: VALID_PRESETS },
        },
        additionalProperties: false,
      },
      {
        required: ['currentStart', 'currentEnd', 'previousStart', 'previousEnd'],
        properties: {
          currentStart: { type: 'string' as const, pattern: '^\\d{4}-\\d{2}-\\d{2}' },
          currentEnd: { type: 'string' as const, pattern: '^\\d{4}-\\d{2}-\\d{2}' },
          previousStart: { type: 'string' as const, pattern: '^\\d{4}-\\d{2}-\\d{2}' },
          previousEnd: { type: 'string' as const, pattern: '^\\d{4}-\\d{2}-\\d{2}' },
        },
        additionalProperties: false,
      },
    ],
  },
};

const comparisonIdParamsSchema = {
  params: {
    type: 'object' as const,
    required: ['id'],
    additionalProperties: false,
    properties: {
      id: {
        type: 'string' as const,
        pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
      },
    },
  },
};

interface GenerateComparisonBody {
  preset?: string;
  currentStart?: string;
  currentEnd?: string;
  previousStart?: string;
  previousEnd?: string;
}

export async function comparisonRoutes(
  fastify: FastifyInstance,
  deps: ComparisonRoutesDeps,
) {
  const { dateComparisonService } = deps;

  // POST /api/comparisons — generate a new date range comparison
  fastify.post<{ Body: GenerateComparisonBody }>(
    '/api/comparisons',
    { schema: generateComparisonSchema },
    async (request, reply) => {
      const store = request.store!;
      const body = request.body;

      let input;
      if (body.preset) {
        input = { preset: body.preset as Parameters<typeof dateComparisonService.generateComparison>[1] extends { preset: infer P } ? P : never };
      } else {
        input = {
          currentStart: body.currentStart!,
          currentEnd: body.currentEnd!,
          previousStart: body.previousStart!,
          previousEnd: body.previousEnd!,
        };
      }

      const comparison = await dateComparisonService.generateComparison(
        store.id,
        input as Parameters<typeof dateComparisonService.generateComparison>[1],
      );

      return reply.status(201).send({
        success: true,
        data: comparison,
      });
    },
  );

  // GET /api/comparisons — list all comparisons for the store
  fastify.get('/api/comparisons', async (request, reply) => {
    const store = request.store!;
    const comparisons = await dateComparisonService.listComparisons(store.id);

    return reply.status(200).send({
      success: true,
      data: { comparisons },
    });
  });

  // GET /api/comparisons/:id — get a specific comparison
  fastify.get<{ Params: { id: string } }>(
    '/api/comparisons/:id',
    { schema: comparisonIdParamsSchema },
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;

      const comparison = await dateComparisonService.getComparison(store.id, id);

      return reply.status(200).send({
        success: true,
        data: comparison,
      });
    },
  );

  // DELETE /api/comparisons/:id — delete a comparison
  fastify.delete<{ Params: { id: string } }>(
    '/api/comparisons/:id',
    { schema: comparisonIdParamsSchema },
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;

      await dateComparisonService.deleteComparison(store.id, id);

      return reply.status(200).send({
        success: true,
        data: { deleted: true },
      });
    },
  );
}
