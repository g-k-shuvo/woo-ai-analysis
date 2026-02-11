import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Knex } from 'knex';
import bcrypt from 'bcrypt';
import { AuthError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface AuthDeps {
  db: Knex;
}

export interface AuthenticatedStore {
  id: string;
  store_url: string;
  plan: string;
  is_active: boolean;
}

// Extend FastifyRequest to include store context
declare module 'fastify' {
  interface FastifyRequest {
    store?: AuthenticatedStore;
  }
}

export function registerAuthMiddleware(fastify: FastifyInstance, deps: AuthDeps) {
  const { db } = deps;

  fastify.decorateRequest('store', undefined);

  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest, _reply: FastifyReply) => {
      // Skip auth for health check and connect endpoint
      const skipPaths = ['/health', '/api/stores/connect'];
      if (skipPaths.includes(request.url)) {
        return;
      }

      // Only protect /api/* routes
      if (!request.url.startsWith('/api/')) {
        return;
      }

      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthError('Missing or invalid Authorization header');
      }

      const token = authHeader.slice(7); // Remove 'Bearer '
      if (!token) {
        throw new AuthError('API key is required');
      }

      // Parse token format: storeUrl:apiKey (base64 encoded)
      let storeUrl: string;
      let apiKey: string;

      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const separatorIndex = decoded.indexOf(':');
        if (separatorIndex === -1) {
          throw new Error('Invalid token format');
        }
        storeUrl = decoded.slice(0, separatorIndex);
        apiKey = decoded.slice(separatorIndex + 1);
      } catch {
        throw new AuthError('Invalid API key format');
      }

      if (!storeUrl || !apiKey) {
        throw new AuthError('Invalid API key format');
      }

      const normalizedUrl = storeUrl.replace(/\/+$/, '').toLowerCase();

      // Look up the store
      const store = await db('stores')
        .where({ store_url: normalizedUrl, is_active: true })
        .first<{ id: string; store_url: string; api_key_hash: string; plan: string; is_active: boolean } | undefined>();

      if (!store) {
        throw new AuthError('Store not found or inactive');
      }

      // Verify API key
      const isValid = await bcrypt.compare(apiKey, store.api_key_hash);
      if (!isValid) {
        logger.warn({ storeUrl: normalizedUrl, requestId: request.id }, 'Invalid API key attempt');
        throw new AuthError('Invalid API key');
      }

      // Attach store to request
      request.store = {
        id: store.id,
        store_url: store.store_url,
        plan: store.plan,
        is_active: store.is_active,
      };
    },
  );
}
