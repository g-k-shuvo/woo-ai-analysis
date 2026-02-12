import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Mock dependencies ───────────────────────────────────────────────

const mockGetStoreContext = jest.fn<() => Promise<{ tables: string[] }>>();
jest.unstable_mockModule('../../../src/ai/schemaContext.js', () => ({
  createSchemaContextService: () => ({
    getStoreContext: mockGetStoreContext,
  }),
}));

jest.unstable_mockModule('../../../src/ai/prompts/system.js', () => ({
  buildSystemPrompt: jest.fn().mockReturnValue('system prompt'),
}));

jest.unstable_mockModule('../../../src/ai/sqlValidator.js', () => ({
  validateSql: jest.fn().mockReturnValue({
    valid: true,
    sql: "SELECT 1 FROM orders WHERE store_id = $1",
    errors: [],
  }),
}));

// ── Import after mocks ─────────────────────────────────────────────

const { createAIQueryPipeline, isRetryableError } = await import('../../../src/ai/pipeline.js');
const { AIError } = await import('../../../src/utils/errors.js');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ─────────────────────────────────────────────────────────

const STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeOpenAIResponse(sql = "SELECT 1 FROM orders WHERE store_id = $1", explanation = 'Answer') {
  return {
    choices: [{
      message: {
        content: JSON.stringify({ sql, explanation }),
      },
    }],
  };
}

function makeOpenAIError(status: number, message = 'Error') {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

interface MockOpenAI {
  chat: {
    completions: {
      create: jest.Mock<() => Promise<unknown>>;
    };
  };
}

function createMockOpenAI(): MockOpenAI {
  return {
    chat: {
      completions: {
        create: jest.fn<() => Promise<unknown>>(),
      },
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('isRetryableError', () => {
  it('returns true for status 429 (rate limit)', () => {
    expect(isRetryableError(makeOpenAIError(429))).toBe(true);
  });

  it('returns true for status 500 (server error)', () => {
    expect(isRetryableError(makeOpenAIError(500))).toBe(true);
  });

  it('returns true for status 502 (bad gateway)', () => {
    expect(isRetryableError(makeOpenAIError(502))).toBe(true);
  });

  it('returns true for status 503 (service unavailable)', () => {
    expect(isRetryableError(makeOpenAIError(503))).toBe(true);
  });

  it('returns false for status 400 (bad request)', () => {
    expect(isRetryableError(makeOpenAIError(400))).toBe(false);
  });

  it('returns false for status 401 (unauthorized)', () => {
    expect(isRetryableError(makeOpenAIError(401))).toBe(false);
  });

  it('returns false for status 403 (forbidden)', () => {
    expect(isRetryableError(makeOpenAIError(403))).toBe(false);
  });

  it('returns true for ETIMEDOUT error code', () => {
    const err = new Error('Timeout') as Error & { code: string };
    err.code = 'ETIMEDOUT';
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns true for ECONNRESET error code', () => {
    const err = new Error('Reset') as Error & { code: string };
    err.code = 'ECONNRESET';
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns true for ECONNABORTED error code', () => {
    const err = new Error('Aborted') as Error & { code: string };
    err.code = 'ECONNABORTED';
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns true for timeout message', () => {
    expect(isRetryableError(new Error('Request timed out'))).toBe(true);
  });

  it('returns true for abort message', () => {
    expect(isRetryableError(new Error('Request was aborted'))).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRetryableError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRetryableError(undefined)).toBe(false);
  });

  it('returns false for regular error without status', () => {
    expect(isRetryableError(new Error('Some other error'))).toBe(false);
  });
});

describe('pipeline retry logic', () => {
  let mockOpenAI: MockOpenAI;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockOpenAI = createMockOpenAI();
    mockGetStoreContext.mockResolvedValue({ tables: ['orders'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Helper: advance timers while running async code
  async function runWithTimers<T>(promise: Promise<T>): Promise<T> {
    const result = promise;
    // Advance timers repeatedly to handle all delays
    for (let i = 0; i < 10; i++) {
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
    }
    return result;
  }

  it('succeeds on first attempt without retrying', async () => {
    mockOpenAI.chat.completions.create.mockResolvedValue(makeOpenAIResponse());

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    const result = await pipeline.processQuestion(STORE_ID, 'Revenue?');

    expect(result.sql).toBeDefined();
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 and succeeds on second attempt', async () => {
    mockOpenAI.chat.completions.create
      .mockRejectedValueOnce(makeOpenAIError(429, 'Rate limited'))
      .mockResolvedValueOnce(makeOpenAIResponse());

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    const result = await runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?'));

    expect(result.sql).toBeDefined();
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('retries on 500 and succeeds on second attempt', async () => {
    mockOpenAI.chat.completions.create
      .mockRejectedValueOnce(makeOpenAIError(500, 'Internal server error'))
      .mockResolvedValueOnce(makeOpenAIResponse());

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    const result = await runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?'));

    expect(result.sql).toBeDefined();
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('retries on timeout error and succeeds', async () => {
    const timeoutErr = new Error('Request timed out') as Error & { code: string };
    timeoutErr.code = 'ETIMEDOUT';
    mockOpenAI.chat.completions.create
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValueOnce(makeOpenAIResponse());

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    const result = await runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?'));

    expect(result.sql).toBeDefined();
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
  });

  it('gives up after max retries and throws AIError', async () => {
    mockOpenAI.chat.completions.create.mockRejectedValue(makeOpenAIError(429, 'Rate limited'));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    await expect(runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?')))
      .rejects.toBeInstanceOf(AIError);

    // 1 initial + 3 retries = 4 total calls
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(4);
  });

  it('throws user-friendly message after max retries', async () => {
    mockOpenAI.chat.completions.create.mockRejectedValue(makeOpenAIError(503));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    await expect(runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?')))
      .rejects.toThrow('Our AI service is temporarily unavailable. Please try again in a moment.');
  });

  it('does not retry on 400 (non-retryable error)', async () => {
    mockOpenAI.chat.completions.create.mockRejectedValue(makeOpenAIError(400, 'Bad request'));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    await expect(runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?')))
      .rejects.toBeInstanceOf(AIError);

    // Only 1 attempt — no retries for 400
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('does not retry on 401 (auth error)', async () => {
    mockOpenAI.chat.completions.create.mockRejectedValue(makeOpenAIError(401, 'Unauthorized'));

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    await expect(runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?')))
      .rejects.toBeInstanceOf(AIError);

    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it('logs retry attempts', async () => {
    mockOpenAI.chat.completions.create
      .mockRejectedValueOnce(makeOpenAIError(429))
      .mockResolvedValueOnce(makeOpenAIResponse());

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    await runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?'));

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: STORE_ID,
        attempt: 1,
        maxRetries: 3,
      }),
      'OpenAI call failed — retrying',
    );
  });

  it('retries multiple times before succeeding', async () => {
    mockOpenAI.chat.completions.create
      .mockRejectedValueOnce(makeOpenAIError(500))
      .mockRejectedValueOnce(makeOpenAIError(502))
      .mockResolvedValueOnce(makeOpenAIResponse());

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    const result = await runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?'));

    expect(result.sql).toBeDefined();
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(3);
  });

  it('preserves original error as cause after max retries', async () => {
    const originalError = makeOpenAIError(503, 'Service Unavailable');
    mockOpenAI.chat.completions.create.mockRejectedValue(originalError);

    const pipeline = createAIQueryPipeline({
      openai: mockOpenAI as unknown as Parameters<typeof createAIQueryPipeline>[0]['openai'],
      schemaContextService: { getStoreContext: mockGetStoreContext } as unknown as Parameters<typeof createAIQueryPipeline>[0]['schemaContextService'],
    });

    try {
      await runWithTimers(pipeline.processQuestion(STORE_ID, 'Revenue?'));
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AIError);
      expect((err as InstanceType<typeof AIError>).cause).toBe(originalError);
    }
  });
});
