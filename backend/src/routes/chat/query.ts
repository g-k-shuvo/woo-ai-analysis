/**
 * Chat routes — POST /api/chat/query + GET /api/chat/suggestions
 *
 * POST /api/chat/query: Accepts a natural language question from the store owner,
 * orchestrates the AI pipeline via chatService, and returns the answer with optional
 * chart configuration. Rate-limited per store.
 *
 * GET /api/chat/suggestions: Returns suggested questions for the chat UI.
 *
 * Auth required: Bearer token (verified by auth middleware).
 */

import type { FastifyInstance } from 'fastify';
import type { ChatService } from '../../services/chatService.js';
import type { RateLimiter } from '../../middleware/rateLimiter.js';

export interface ChatQueryDeps {
  chatService: ChatService;
  rateLimiter?: RateLimiter;
}

const chatQuerySchema = {
  body: {
    type: 'object' as const,
    required: ['question'],
    additionalProperties: false,
    properties: {
      question: { type: 'string' as const, minLength: 1, maxLength: 2000 },
    },
  },
};

export async function chatQueryRoutes(fastify: FastifyInstance, deps: ChatQueryDeps) {
  const { chatService, rateLimiter } = deps;

  // POST /api/chat/query — ask a question about store data (auth required, rate limited)
  fastify.post<{ Body: { question: string } }>('/api/chat/query', { schema: chatQuerySchema }, async (request, reply) => {
    const store = request.store!;

    // Rate limit check (per-store)
    if (rateLimiter) {
      await rateLimiter.checkLimit(store.id);
    }

    const { question } = request.body;

    const result = await chatService.ask(store.id, question);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });

  // GET /api/chat/suggestions — get suggested questions (auth required)
  fastify.get('/api/chat/suggestions', async (_request, reply) => {
    const result = chatService.getSuggestions();

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
