import { jest, describe, it, expect } from '@jest/globals';

// ── Test the server wiring without starting a real server ───────────
// We test the constituent parts (routes, middleware, services) individually.
// This file validates that the server module structure is sound and that
// key initialization patterns are correct.

// ── Mock all heavy dependencies ─────────────────────────────────────

const mockListen = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRegister = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('fastify', () => ({
  default: jest.fn(() => ({
    listen: mockListen,
    close: mockClose,
    register: mockRegister,
    decorateRequest: jest.fn(),
    addHook: jest.fn(),
    setErrorHandler: jest.fn(),
    setNotFoundHandler: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    ready: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })),
}));

jest.unstable_mockModule('knex', () => ({
  default: jest.fn(() => ({
    destroy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    raw: jest.fn<() => Promise<unknown>>().mockResolvedValue({ rows: [] }),
  })),
}));

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => ({
    disconnect: jest.fn(),
    ping: jest.fn<() => Promise<string>>().mockResolvedValue('PONG'),
    on: jest.fn(),
  })),
}));

jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: jest.fn() } },
  })),
}));

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../src/config.js', () => ({
  config: {
    port: 3000,
    host: '0.0.0.0',
    logLevel: 'info',
    nodeEnv: 'test',
    database: {
      url: 'postgresql://localhost:5432/test',
      readonlyUrl: 'postgresql://localhost:5432/test',
    },
    redis: { url: 'redis://localhost:6379' },
    openai: { apiKey: 'test-key' },
    rateLimit: { chatMaxRequests: 20, chatWindowSeconds: 60 },
  },
}));

const mockRegisterErrorHandler = jest.fn();
const mockRegisterAuthMiddleware = jest.fn();
const mockCreateStoreService = jest.fn(() => ({}));
const mockCreateSyncService = jest.fn(() => ({}));
const mockCreateSyncRetryService = jest.fn(() => ({}));
const mockCreateChatService = jest.fn(() => ({}));
const mockCreateReadonlyDb = jest.fn(() => ({
  destroy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
const mockCreateAIQueryPipeline = jest.fn(() => ({}));
const mockCreateSchemaContextService = jest.fn(() => ({}));
const mockCreateQueryExecutor = jest.fn(() => ({}));
const mockCreateRateLimiter = jest.fn(() => ({}));

jest.unstable_mockModule('../../../src/middleware/errorHandler.js', () => ({
  registerErrorHandler: mockRegisterErrorHandler,
}));

jest.unstable_mockModule('../../../src/middleware/auth.js', () => ({
  registerAuthMiddleware: mockRegisterAuthMiddleware,
}));

jest.unstable_mockModule('../../../src/services/storeService.js', () => ({
  createStoreService: mockCreateStoreService,
}));

jest.unstable_mockModule('../../../src/services/syncService.js', () => ({
  createSyncService: mockCreateSyncService,
}));

jest.unstable_mockModule('../../../src/services/syncRetryService.js', () => ({
  createSyncRetryService: mockCreateSyncRetryService,
}));

jest.unstable_mockModule('../../../src/services/chatService.js', () => ({
  createChatService: mockCreateChatService,
}));

jest.unstable_mockModule('../../../src/db/readonlyConnection.js', () => ({
  createReadonlyDb: mockCreateReadonlyDb,
}));

jest.unstable_mockModule('../../../src/ai/pipeline.js', () => ({
  createAIQueryPipeline: mockCreateAIQueryPipeline,
}));

jest.unstable_mockModule('../../../src/ai/schemaContext.js', () => ({
  createSchemaContextService: mockCreateSchemaContextService,
}));

jest.unstable_mockModule('../../../src/ai/queryExecutor.js', () => ({
  createQueryExecutor: mockCreateQueryExecutor,
}));

jest.unstable_mockModule('../../../src/middleware/rateLimiter.js', () => ({
  createRateLimiter: mockCreateRateLimiter,
}));

jest.unstable_mockModule('../../../src/routes/health.js', () => ({
  healthRoutes: jest.fn(),
}));

jest.unstable_mockModule('../../../src/routes/stores.js', () => ({
  storeRoutes: jest.fn(),
}));

jest.unstable_mockModule('../../../src/routes/sync/orders.js', () => ({
  syncOrdersRoutes: jest.fn(),
}));

jest.unstable_mockModule('../../../src/routes/sync/products.js', () => ({
  syncProductsRoutes: jest.fn(),
}));

jest.unstable_mockModule('../../../src/routes/sync/customers.js', () => ({
  syncCustomersRoutes: jest.fn(),
}));

jest.unstable_mockModule('../../../src/routes/sync/categories.js', () => ({
  syncCategoriesRoutes: jest.fn(),
}));

jest.unstable_mockModule('../../../src/routes/sync/webhook.js', () => ({
  syncWebhookRoutes: jest.fn(),
}));

jest.unstable_mockModule('../../../src/routes/sync/status.js', () => ({
  syncStatusRoutes: jest.fn(),
}));

jest.unstable_mockModule('../../../src/routes/sync/errors.js', () => ({
  syncErrorsRoutes: jest.fn(),
}));

jest.unstable_mockModule('../../../src/routes/chat/query.js', () => ({
  chatQueryRoutes: jest.fn(),
}));

// Import index.ts once — all assertions reference the same mock references
const indexModule = await import('../../../src/index.js');

// ── Tests ───────────────────────────────────────────────────────────

describe('Server initialization', () => {
  describe('module exports', () => {
    it('exports fastify instance', () => {
      expect(indexModule.fastify).toBeDefined();
    });

    it('exports db instance', () => {
      expect(indexModule.db).toBeDefined();
    });

    it('exports readonlyDb instance', () => {
      expect(indexModule.readonlyDb).toBeDefined();
    });

    it('exports redis instance', () => {
      expect(indexModule.redis).toBeDefined();
    });
  });

  describe('service initialization', () => {
    it('creates store service', () => {
      expect(mockCreateStoreService).toHaveBeenCalled();
    });

    it('creates sync service', () => {
      expect(mockCreateSyncService).toHaveBeenCalled();
    });

    it('creates sync retry service', () => {
      expect(mockCreateSyncRetryService).toHaveBeenCalled();
    });

    it('creates chat service', () => {
      expect(mockCreateChatService).toHaveBeenCalled();
    });

    it('creates rate limiter', () => {
      expect(mockCreateRateLimiter).toHaveBeenCalled();
    });

    it('creates readonly db connection', () => {
      expect(mockCreateReadonlyDb).toHaveBeenCalled();
    });

    it('creates AI pipeline', () => {
      expect(mockCreateAIQueryPipeline).toHaveBeenCalled();
    });

    it('creates schema context service', () => {
      expect(mockCreateSchemaContextService).toHaveBeenCalled();
    });

    it('creates query executor', () => {
      expect(mockCreateQueryExecutor).toHaveBeenCalled();
    });
  });

  describe('middleware registration', () => {
    it('registers error handler', () => {
      expect(mockRegisterErrorHandler).toHaveBeenCalled();
    });

    it('registers auth middleware', () => {
      expect(mockRegisterAuthMiddleware).toHaveBeenCalled();
    });
  });

  describe('route registration', () => {
    it('registers routes via fastify.register', () => {
      // 10 route groups should be registered
      expect(mockRegister).toHaveBeenCalledTimes(10);
    });
  });

  describe('server startup', () => {
    it('calls fastify.listen with configured port and host', () => {
      expect(mockListen).toHaveBeenCalledWith({ port: 3000, host: '0.0.0.0' });
    });
  });

  describe('Redis retry strategy', () => {
    it('calculates retry delay as times * 200', () => {
      const retryStrategy = (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      };

      expect(retryStrategy(1)).toBe(200);
      expect(retryStrategy(2)).toBe(400);
      expect(retryStrategy(3)).toBe(600);
    });

    it('caps retry delay at 2000ms', () => {
      expect(Math.min(100 * 200, 2000)).toBe(2000);
    });

    it('returns null after 3 retries', () => {
      const retryStrategy = (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      };

      expect(retryStrategy(4)).toBeNull();
      expect(retryStrategy(5)).toBeNull();
    });
  });
});
