import Fastify from 'fastify';
import knex from 'knex';
import { Redis as IORedis } from 'ioredis';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { healthRoutes } from './routes/health.js';
import { storeRoutes } from './routes/stores.js';
import { registerErrorHandler } from './middleware/errorHandler.js';
import { registerAuthMiddleware } from './middleware/auth.js';
import { createStoreService } from './services/storeService.js';
import { createSyncService } from './services/syncService.js';
import { syncOrdersRoutes } from './routes/sync/orders.js';
import { syncProductsRoutes } from './routes/sync/products.js';
import { syncCustomersRoutes } from './routes/sync/customers.js';
import { syncCategoriesRoutes } from './routes/sync/categories.js';
import { syncWebhookRoutes } from './routes/sync/webhook.js';
import { syncStatusRoutes } from './routes/sync/status.js';
import { syncErrorsRoutes } from './routes/sync/errors.js';
import { createSyncRetryService } from './services/syncRetryService.js';
import { createReadonlyDb } from './db/readonlyConnection.js';

const startTime = Date.now();

const fastify = Fastify({
  logger: false,
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID(),
});

// Database
const db = knex({
  client: 'pg',
  connection: config.database.url,
  pool: { min: 2, max: 10 },
});

// Read-only database (for AI-generated queries)
const readonlyDb = createReadonlyDb(config.database.readonlyUrl);

// Redis
const redis = new IORedis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

// Request logging
fastify.addHook('onRequest', async (request) => {
  logger.info({ requestId: request.id, method: request.method, url: request.url }, 'Request received');
});

fastify.addHook('onResponse', async (request, reply) => {
  logger.info(
    { requestId: request.id, method: request.method, url: request.url, statusCode: reply.statusCode },
    'Request completed',
  );
});

// Error handler
registerErrorHandler(fastify);

// Auth middleware
registerAuthMiddleware(fastify, { db });

// Services
const storeService = createStoreService({ db });
const syncService = createSyncService({ db });
const syncRetryService = createSyncRetryService({ db });

// Routes
await fastify.register(
  async (instance) => healthRoutes(instance, { db, redis, startTime }),
);

await fastify.register(
  async (instance) => storeRoutes(instance, { storeService }),
);

await fastify.register(
  async (instance) => syncOrdersRoutes(instance, { syncService }),
);

await fastify.register(
  async (instance) => syncProductsRoutes(instance, { syncService }),
);

await fastify.register(
  async (instance) => syncCustomersRoutes(instance, { syncService }),
);

await fastify.register(
  async (instance) => syncCategoriesRoutes(instance, { syncService }),
);

await fastify.register(
  async (instance) => syncWebhookRoutes(instance, { syncService }),
);

await fastify.register(
  async (instance) => syncStatusRoutes(instance, { syncService }),
);

await fastify.register(
  async (instance) => syncErrorsRoutes(instance, { syncRetryService }),
);

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully...');
  await fastify.close();
  await db.destroy();
  await readonlyDb.destroy();
  redis.disconnect();
  logger.info('Server shut down');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start
try {
  await fastify.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'Server started');
} catch (err) {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
}

export { fastify, db, readonlyDb, redis };
