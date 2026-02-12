import type { FastifyInstance } from 'fastify';
import type { RevenueForecastService } from '../../services/revenueForecastService.js';

export interface ForecastRoutesDeps {
  revenueForecastService: RevenueForecastService;
}

interface GenerateForecastBody {
  daysAhead: number;
}

const generateForecastSchema = {
  body: {
    type: 'object' as const,
    required: ['daysAhead'],
    additionalProperties: false,
    properties: {
      daysAhead: { type: 'integer' as const, enum: [7, 14, 30] },
    },
  },
};

const forecastIdParamsSchema = {
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

export async function forecastRoutes(
  fastify: FastifyInstance,
  deps: ForecastRoutesDeps,
) {
  const { revenueForecastService } = deps;

  // POST /api/forecasts — generate a new revenue forecast
  fastify.post<{ Body: GenerateForecastBody }>(
    '/api/forecasts',
    { schema: generateForecastSchema },
    async (request, reply) => {
      const store = request.store!;
      const { daysAhead } = request.body;

      const forecast = await revenueForecastService.generateForecast(store.id, {
        daysAhead,
      });

      return reply.status(201).send({
        success: true,
        data: forecast,
      });
    },
  );

  // GET /api/forecasts — list all forecasts for the store
  fastify.get('/api/forecasts', async (request, reply) => {
    const store = request.store!;
    const forecasts = await revenueForecastService.listForecasts(store.id);

    return reply.status(200).send({
      success: true,
      data: { forecasts },
    });
  });

  // GET /api/forecasts/:id — get a specific forecast
  fastify.get<{ Params: { id: string } }>(
    '/api/forecasts/:id',
    { schema: forecastIdParamsSchema },
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;

      const forecast = await revenueForecastService.getForecast(store.id, id);

      return reply.status(200).send({
        success: true,
        data: forecast,
      });
    },
  );

  // DELETE /api/forecasts/:id — delete a forecast
  fastify.delete<{ Params: { id: string } }>(
    '/api/forecasts/:id',
    { schema: forecastIdParamsSchema },
    async (request, reply) => {
      const store = request.store!;
      const { id } = request.params;

      await revenueForecastService.deleteForecast(store.id, id);

      return reply.status(200).send({
        success: true,
        data: { deleted: true },
      });
    },
  );
}
