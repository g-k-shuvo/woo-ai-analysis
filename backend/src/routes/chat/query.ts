/**
 * Chat query route — POST /api/chat/query
 *
 * Accepts a natural language question from the store owner,
 * orchestrates the AI pipeline via chatService, and returns
 * the answer with optional chart configuration.
 *
 * Auth required: Bearer token (verified by auth middleware).
 */

import type { FastifyInstance } from 'fastify';
import type { ChatService } from '../../services/chatService.js';

export interface ChatQueryDeps {
  chatService: ChatService;
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
  const { chatService } = deps;

  // POST /api/chat/query — ask a question about store data (auth required)
  fastify.post<{ Body: { question: string } }>('/api/chat/query', { schema: chatQuerySchema }, async (request, reply) => {
    const store = request.store!;
    const { question } = request.body;

    const result = await chatService.ask(store.id, question);

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
