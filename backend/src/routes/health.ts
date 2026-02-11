import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import type { Redis } from 'ioredis';

interface HealthDeps {
  db: Knex;
  redis: Redis;
  startTime: number;
}

export async function healthRoutes(fastify: FastifyInstance, deps: HealthDeps) {
  fastify.get('/health', async (_request, reply) => {
    let dbStatus = 'disconnected';
    let redisStatus = 'disconnected';

    try {
      await deps.db.raw('SELECT 1');
      dbStatus = 'connected';
    } catch {
      dbStatus = 'disconnected';
    }

    try {
      const pong = await deps.redis.ping();
      redisStatus = pong === 'PONG' ? 'connected' : 'disconnected';
    } catch {
      redisStatus = 'disconnected';
    }

    const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';
    const statusCode = isHealthy ? 200 : 503;

    return reply.status(statusCode).send({
      status: isHealthy ? 'ok' : 'degraded',
      version: '1.0.0',
      uptime: Math.floor((Date.now() - deps.startTime) / 1000),
      db: dbStatus,
      redis: redisStatus,
    });
  });
}
