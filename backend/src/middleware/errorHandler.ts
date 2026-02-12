import type { FastifyInstance, FastifyError } from 'fastify';
import { AppError, RateLimitError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function registerErrorHandler(fastify: FastifyInstance) {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;

    if (error instanceof RateLimitError) {
      logger.warn(
        { err: error, requestId, code: error.code, retryAfter: error.retryAfter },
        `Rate limit exceeded: ${error.message}`,
      );
      return reply
        .status(429)
        .header('Retry-After', String(error.retryAfter))
        .send(error.toJSON());
    }

    if (error instanceof AppError) {
      logger.warn(
        { err: error, requestId, code: error.code },
        `Operational error: ${error.message}`,
      );
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Fastify validation errors
    if (error.validation) {
      logger.warn({ err: error, requestId }, 'Validation error');
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
      });
    }

    // Unexpected errors
    logger.error({ err: error, requestId }, `Unexpected error: ${error.message}`);
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });
}
