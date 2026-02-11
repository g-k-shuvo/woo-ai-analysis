export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      isOperational?: boolean;
      cause?: Error;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.isOperational = options.isOperational ?? true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options: { cause?: Error } = {}) {
    super(message, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      ...options,
    });
  }
}

export class AuthError extends AppError {
  constructor(message = 'Unauthorized', options: { cause?: Error } = {}) {
    super(message, {
      statusCode: 401,
      code: 'AUTH_ERROR',
      ...options,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', options: { cause?: Error } = {}) {
    super(message, {
      statusCode: 404,
      code: 'NOT_FOUND',
      ...options,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', options: { cause?: Error } = {}) {
    super(message, {
      statusCode: 429,
      code: 'RATE_LIMIT_ERROR',
      ...options,
    });
  }
}

export class AIError extends AppError {
  constructor(message: string, options: { cause?: Error } = {}) {
    super(message, {
      statusCode: 502,
      code: 'AI_ERROR',
      ...options,
    });
  }
}

export class SyncError extends AppError {
  constructor(message: string, options: { cause?: Error } = {}) {
    super(message, {
      statusCode: 500,
      code: 'SYNC_ERROR',
      ...options,
    });
  }
}
