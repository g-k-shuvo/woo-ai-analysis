import { describe, it, expect } from '@jest/globals';
import {
  AppError,
  ValidationError,
  AuthError,
  NotFoundError,
  RateLimitError,
  AIError,
  SyncError,
} from '../../src/utils/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('creates error with default values', () => {
      const error = new AppError('Something went wrong');
      expect(error.message).toBe('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('creates error with custom values', () => {
      const error = new AppError('Custom error', {
        statusCode: 418,
        code: 'TEAPOT',
        isOperational: false,
      });
      expect(error.statusCode).toBe(418);
      expect(error.code).toBe('TEAPOT');
      expect(error.isOperational).toBe(false);
    });

    it('preserves cause', () => {
      const cause = new Error('root cause');
      const error = new AppError('Wrapped error', { cause });
      expect(error.cause).toBe(cause);
    });

    it('serializes to JSON correctly', () => {
      const error = new AppError('Test error', { code: 'TEST' });
      const json = error.toJSON();
      expect(json).toEqual({
        success: false,
        error: {
          code: 'TEST',
          message: 'Test error',
        },
      });
    });
  });

  describe('ValidationError', () => {
    it('has correct defaults', () => {
      const error = new ValidationError('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
    });
  });

  describe('AuthError', () => {
    it('has correct defaults', () => {
      const error = new AuthError();
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.message).toBe('Unauthorized');
    });

    it('accepts custom message', () => {
      const error = new AuthError('Token expired');
      expect(error.message).toBe('Token expired');
    });
  });

  describe('NotFoundError', () => {
    it('has correct defaults', () => {
      const error = new NotFoundError();
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });

  describe('RateLimitError', () => {
    it('has correct defaults', () => {
      const error = new RateLimitError();
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
    });

    it('defaults retryAfter to 60', () => {
      const error = new RateLimitError();
      expect(error.retryAfter).toBe(60);
    });

    it('accepts custom retryAfter', () => {
      const error = new RateLimitError('Too many', { retryAfter: 30 });
      expect(error.retryAfter).toBe(30);
    });

    it('serializes to JSON with retryAfter', () => {
      const error = new RateLimitError('Slow down', { retryAfter: 15 });
      const json = error.toJSON();
      expect(json).toEqual({
        success: false,
        error: {
          code: 'RATE_LIMIT_ERROR',
          message: 'Slow down',
          retryAfter: 15,
        },
      });
    });

    it('preserves cause', () => {
      const cause = new Error('upstream');
      const error = new RateLimitError('Rate limited', { cause });
      expect(error.cause).toBe(cause);
    });
  });

  describe('AIError', () => {
    it('has correct defaults', () => {
      const error = new AIError('Model failed');
      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('AI_ERROR');
      expect(error.message).toBe('Model failed');
    });
  });

  describe('SyncError', () => {
    it('has correct defaults', () => {
      const error = new SyncError('Sync timeout');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('SYNC_ERROR');
      expect(error.message).toBe('Sync timeout');
    });
  });
});
