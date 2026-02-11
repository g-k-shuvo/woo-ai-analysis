import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { AIQueryResult } from '../../../src/ai/types.js';

// ── Mock logger before importing the module under test ──────────────

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createQueryExecutor } = await import('../../../src/ai/queryExecutor.js');
const { logger } = await import('../../../src/utils/logger.js');

// ── Helpers ──────────────────────────────────────────────────────────

function makeQueryResult(overrides: Partial<AIQueryResult> = {}): AIQueryResult {
  return {
    sql: 'SELECT COUNT(*) AS total FROM orders WHERE store_id = $1 LIMIT 100',
    params: ['550e8400-e29b-41d4-a716-446655440000'],
    explanation: 'Count of all orders',
    chartSpec: null,
    ...overrides,
  };
}

function makeMockDb(rows: Record<string, unknown>[] = []) {
  return {
    raw: jest.fn<() => Promise<{ rows: Record<string, unknown>[] }>>()
      .mockResolvedValue({ rows }),
  };
}

describe('createQueryExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful execution', () => {
    it('executes SQL with correct params via readonlyDb.raw', async () => {
      const mockDb = makeMockDb([{ total: '42' }]);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      const queryResult = makeQueryResult();
      await executor.execute(queryResult);

      expect(mockDb.raw).toHaveBeenCalledTimes(1);
      expect(mockDb.raw).toHaveBeenCalledWith(
        queryResult.sql,
        queryResult.params,
      );
    });

    it('returns rows from the query result', async () => {
      const expectedRows = [
        { product_name: 'Widget', total_revenue: '1234.56' },
        { product_name: 'Gadget', total_revenue: '789.00' },
      ];
      const mockDb = makeMockDb(expectedRows);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      const result = await executor.execute(makeQueryResult());

      expect(result.rows).toEqual(expectedRows);
    });

    it('returns correct rowCount', async () => {
      const rows = [{ a: 1 }, { a: 2 }, { a: 3 }];
      const mockDb = makeMockDb(rows);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      const result = await executor.execute(makeQueryResult());

      expect(result.rowCount).toBe(3);
    });

    it('returns durationMs as a non-negative number', async () => {
      const mockDb = makeMockDb([{ total: '1' }]);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      const result = await executor.execute(makeQueryResult());

      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns empty rows for queries with no results', async () => {
      const mockDb = makeMockDb([]);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      const result = await executor.execute(makeQueryResult());

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('handles result object without rows property', async () => {
      const mockDb = {
        raw: jest.fn<() => Promise<Record<string, unknown>>>()
          .mockResolvedValue({}),
      };
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      const result = await executor.execute(makeQueryResult());

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });
  });

  describe('row truncation', () => {
    it('truncates rows to MAX_ROWS (1000) if exceeded', async () => {
      const largeRowSet = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
      const mockDb = makeMockDb(largeRowSet);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      const result = await executor.execute(makeQueryResult());

      expect(result.rows.length).toBe(1000);
      expect(result.rowCount).toBe(1000);
    });

    it('does not truncate rows at exactly MAX_ROWS', async () => {
      const exactRows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
      const mockDb = makeMockDb(exactRows);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      const result = await executor.execute(makeQueryResult());

      expect(result.rows.length).toBe(1000);
      expect(result.rowCount).toBe(1000);
    });

    it('does not truncate rows below MAX_ROWS', async () => {
      const smallRows = Array.from({ length: 50 }, (_, i) => ({ id: i }));
      const mockDb = makeMockDb(smallRows);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      const result = await executor.execute(makeQueryResult());

      expect(result.rows.length).toBe(50);
      expect(result.rowCount).toBe(50);
    });
  });

  describe('error handling', () => {
    it('throws AIError with user-friendly message on statement timeout', async () => {
      const mockDb = {
        raw: jest.fn<() => Promise<never>>().mockRejectedValue(
          new Error('canceling statement due to statement timeout'),
        ),
      };
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      await expect(executor.execute(makeQueryResult())).rejects.toThrow(
        'The query took too long to execute. Try asking a simpler question.',
      );
    });

    it('throws AIError with user-friendly message on "statement timeout" variant', async () => {
      const mockDb = {
        raw: jest.fn<() => Promise<never>>().mockRejectedValue(
          new Error('statement timeout'),
        ),
      };
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      await expect(executor.execute(makeQueryResult())).rejects.toThrow(
        'The query took too long to execute. Try asking a simpler question.',
      );
    });

    it('throws AIError on permission denied errors', async () => {
      const mockDb = {
        raw: jest.fn<() => Promise<never>>().mockRejectedValue(
          new Error('permission denied for table orders'),
        ),
      };
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      await expect(executor.execute(makeQueryResult())).rejects.toThrow(
        'Query execution failed due to a permissions error.',
      );
    });

    it('throws AIError on SQL syntax errors', async () => {
      const mockDb = {
        raw: jest.fn<() => Promise<never>>().mockRejectedValue(
          new Error('syntax error at or near "SELEC"'),
        ),
      };
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      await expect(executor.execute(makeQueryResult())).rejects.toThrow(
        'The generated query contained a syntax error. Please try rephrasing your question.',
      );
    });

    it('throws AIError on unknown errors', async () => {
      const mockDb = {
        raw: jest.fn<() => Promise<never>>().mockRejectedValue(
          new Error('connection refused'),
        ),
      };
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      await expect(executor.execute(makeQueryResult())).rejects.toThrow(
        'Query execution failed unexpectedly.',
      );
    });

    it('wraps non-Error throwables in AIError', async () => {
      const mockDb = {
        raw: jest.fn<() => Promise<never>>().mockRejectedValue('string error'),
      };
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      await expect(executor.execute(makeQueryResult())).rejects.toThrow(
        'Query execution failed unexpectedly.',
      );
    });

    it('sets AIError cause to original error', async () => {
      const originalError = new Error('canceling statement due to statement timeout');
      const mockDb = {
        raw: jest.fn<() => Promise<never>>().mockRejectedValue(originalError),
      };
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      try {
        await executor.execute(makeQueryResult());
        expect(true).toBe(false); // should not reach here
      } catch (err) {
        expect((err as Error).cause).toBe(originalError);
      }
    });
  });

  describe('logging', () => {
    it('logs execution start with sqlLength and paramCount', async () => {
      const mockDb = makeMockDb([{ total: '1' }]);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });
      const queryResult = makeQueryResult();

      await executor.execute(queryResult);

      expect(logger.info).toHaveBeenCalledWith(
        { sqlLength: queryResult.sql.length, paramCount: queryResult.params.length },
        'Query executor: starting execution',
      );
    });

    it('logs execution completion with durationMs and rowCount', async () => {
      const mockDb = makeMockDb([{ total: '1' }, { total: '2' }]);
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      await executor.execute(makeQueryResult());

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ durationMs: expect.any(Number), rowCount: 2 }),
        'Query executor: execution completed',
      );
    });

    it('logs errors with durationMs and error message', async () => {
      const mockDb = {
        raw: jest.fn<() => Promise<never>>().mockRejectedValue(
          new Error('connection refused'),
        ),
      };
      const executor = createQueryExecutor({ readonlyDb: mockDb as never });

      try {
        await executor.execute(makeQueryResult());
      } catch {
        // expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMs: expect.any(Number),
          error: 'connection refused',
        }),
        'Query executor: execution failed',
      );
    });
  });
});
