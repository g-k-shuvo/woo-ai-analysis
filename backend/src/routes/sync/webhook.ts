import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../../services/syncService.js';
import { logger } from '../../utils/logger.js';

interface SyncWebhookDeps {
  syncService: SyncService;
}

const VALID_RESOURCES = ['order', 'product', 'customer', 'category'] as const;
type WebhookResource = (typeof VALID_RESOURCES)[number];

const VALID_ACTIONS = ['created', 'updated'] as const;
type WebhookAction = (typeof VALID_ACTIONS)[number];

interface WebhookBody {
  resource: WebhookResource;
  action: WebhookAction;
  data: Record<string, unknown>;
}

const syncWebhookSchema = {
  body: {
    type: 'object' as const,
    required: ['resource', 'action', 'data'],
    additionalProperties: false,
    properties: {
      resource: { type: 'string' as const, enum: ['order', 'product', 'customer', 'category'] },
      action: { type: 'string' as const, enum: ['created', 'updated'] },
      data: { type: 'object' as const },
    },
  },
};

const RESOURCE_TO_SYNC_TYPE: Record<WebhookResource, string> = {
  order: 'webhook:orders',
  product: 'webhook:products',
  customer: 'webhook:customers',
  category: 'webhook:categories',
};

export async function syncWebhookRoutes(fastify: FastifyInstance, deps: SyncWebhookDeps) {
  const { syncService } = deps;

  const RESOURCE_TO_UPSERT: Record<WebhookResource, (storeId: string, data: unknown[], syncType: string) => Promise<unknown>> = {
    order: (storeId, data, syncType) => syncService.upsertOrders(storeId, data, syncType),
    product: (storeId, data, syncType) => syncService.upsertProducts(storeId, data, syncType),
    customer: (storeId, data, syncType) => syncService.upsertCustomers(storeId, data, syncType),
    category: (storeId, data, syncType) => syncService.upsertCategories(storeId, data, syncType),
  };

  // POST /api/sync/webhook — handle single-entity webhook event (auth required)
  fastify.post('/api/sync/webhook', { schema: syncWebhookSchema }, async (request, reply) => {
    const store = request.store!;
    const { resource, action, data } = request.body as WebhookBody;

    const syncType = RESOURCE_TO_SYNC_TYPE[resource];
    const upsert = RESOURCE_TO_UPSERT[resource];
    const result = await upsert(store.id, [data], syncType);

    logger.info({ storeId: store.id, resource, action }, 'Webhook event processed');

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
