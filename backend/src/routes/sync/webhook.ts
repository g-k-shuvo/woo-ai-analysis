import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../../services/syncService.js';
import { ValidationError } from '../../utils/errors.js';

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

  // POST /api/sync/webhook — handle single-entity webhook event (auth required)
  fastify.post('/api/sync/webhook', { schema: syncWebhookSchema }, async (request, reply) => {
    const store = request.store!;
    const { resource, data } = request.body as WebhookBody;

    const syncType = RESOURCE_TO_SYNC_TYPE[resource];
    if (!syncType) {
      throw new ValidationError(`Invalid resource type: ${resource}`);
    }

    let result;

    switch (resource) {
      case 'order':
        result = await syncService.upsertOrders(store.id, [data], syncType);
        break;
      case 'product':
        result = await syncService.upsertProducts(store.id, [data], syncType);
        break;
      case 'customer':
        result = await syncService.upsertCustomers(store.id, [data], syncType);
        break;
      case 'category':
        result = await syncService.upsertCategories(store.id, [data], syncType);
        break;
    }

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
