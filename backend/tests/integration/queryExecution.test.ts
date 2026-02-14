import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { AIQueryResult } from '../../src/ai/types.js';

/**
 * Integration tests for the query executor.
 *
 * These tests require a running PostgreSQL instance with the woo_ai_readonly
 * user created via init-readonly-user.sql. They verify that:
 * 1. SELECT queries execute and return structured results
 * 2. Parameterized store_id queries work correctly
 * 3. Statement timeout is enforced via the readonlyDb connection
 * 4. Empty result sets are handled
 *
 * Skipped when DATABASE_READONLY_URL is not set (CI without Postgres).
 */

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createReadonlyDb } = await import('../../src/db/readonlyConnection.js');
const { createQueryExecutor } = await import('../../src/ai/queryExecutor.js');

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const READONLY_URL =
  process.env.DATABASE_READONLY_URL ||
  'postgresql://woo_ai_readonly:woo_ai_pass@localhost:5433/woo_ai_analytics';

// DEV ONLY: These credentials are for local Docker development. Never use in production.
const PRIMARY_URL =
  process.env.DATABASE_URL ||
  'postgresql://woo_ai:woo_ai_pass@localhost:5433/woo_ai_analytics';

const TEST_STORE_ID = '550e8400-e29b-41d4-a716-446655440000';

let dbAvailable = false;

describe('Query executor integration', () => {
  let readonlyDb: ReturnType<typeof createReadonlyDb>;
  let primaryDb: ReturnType<typeof createReadonlyDb>;

  beforeAll(async () => {
    try {
      const knexModule = await import('knex');
      const knex = knexModule.default;

      // Set up primary DB for test data
      primaryDb = knex({
        client: 'pg',
        connection: PRIMARY_URL,
        pool: { min: 1, max: 2 },
      });
      await primaryDb.raw('SELECT 1');

      // Create test table if needed
      const tableExists = await primaryDb.schema.hasTable('_query_exec_test');
      if (!tableExists) {
        await primaryDb.schema.createTable('_query_exec_test', (table) => {
          table.uuid('id').primary().defaultTo(primaryDb.raw('gen_random_uuid()'));
          table.uuid('store_id').notNullable();
          table.string('name', 100);
          table.decimal('amount', 12, 2);
        });

        await primaryDb.raw('GRANT SELECT ON _query_exec_test TO woo_ai_readonly');

        // Insert test data
        await primaryDb('_query_exec_test').insert([
          { store_id: TEST_STORE_ID, name: 'Product A', amount: 29.99 },
          { store_id: TEST_STORE_ID, name: 'Product B', amount: 49.99 },
          { store_id: TEST_STORE_ID, name: 'Product C', amount: 99.99 },
          { store_id: '660e8400-e29b-41d4-a716-446655440000', name: 'Other Store', amount: 10.00 },
        ]);
      }

      // Create readonly connection
      readonlyDb = createReadonlyDb(READONLY_URL);
      await readonlyDb.raw('SELECT 1');

      dbAvailable = true;
    } catch (error) {
      dbAvailable = false;
      // eslint-disable-next-line no-console
      console.warn('Skipping query execution integration tests: DB setup failed.', error);
    }
  });

  afterAll(async () => {
    if (primaryDb) {
      try {
        await primaryDb.schema.dropTableIfExists('_query_exec_test');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Failed to drop test table during cleanup:', error);
      }
      await primaryDb.destroy();
    }
    if (readonlyDb) {
      await readonlyDb.destroy();
    }
  });

  describe('successful queries', () => {
    it('executes a count query and returns rows', async () => {
      if (!dbAvailable) return;

      const executor = createQueryExecutor({ readonlyDb });
      const queryResult: AIQueryResult = {
        sql: 'SELECT COUNT(*) AS total FROM _query_exec_test WHERE store_id = $1 LIMIT 1',
        params: [TEST_STORE_ID],
        explanation: 'Count test rows',
        chartSpec: null,
      };

      const result = await executor.execute(queryResult);

      expect(result.rowCount).toBe(1);
      expect(parseInt(result.rows[0].total as string, 10)).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.truncated).toBe(false);
    });

    it('executes a SELECT query and returns multiple rows', async () => {
      if (!dbAvailable) return;

      const executor = createQueryExecutor({ readonlyDb });
      const queryResult: AIQueryResult = {
        sql: 'SELECT name, amount FROM _query_exec_test WHERE store_id = $1 ORDER BY amount DESC LIMIT 100',
        params: [TEST_STORE_ID],
        explanation: 'List products by amount',
        chartSpec: null,
      };

      const result = await executor.execute(queryResult);

      expect(result.rowCount).toBe(3);
      expect(result.rows[0].name).toBe('Product C');
      expect(parseFloat(result.rows[0].amount as string)).toBe(99.99);
    });

    it('isolates data by store_id parameter', async () => {
      if (!dbAvailable) return;

      const executor = createQueryExecutor({ readonlyDb });
      const queryResult: AIQueryResult = {
        sql: 'SELECT name FROM _query_exec_test WHERE store_id = $1 LIMIT 100',
        params: [TEST_STORE_ID],
        explanation: 'List products for our store only',
        chartSpec: null,
      };

      const result = await executor.execute(queryResult);

      // Should only get our store's 3 rows, not the other store's row
      expect(result.rowCount).toBe(3);
      const names = result.rows.map((r) => r.name);
      expect(names).not.toContain('Other Store');
    });

    it('returns empty results for non-matching store_id', async () => {
      if (!dbAvailable) return;

      const executor = createQueryExecutor({ readonlyDb });
      const queryResult: AIQueryResult = {
        sql: 'SELECT name FROM _query_exec_test WHERE store_id = $1 LIMIT 100',
        params: ['00000000-0000-0000-0000-000000000000'],
        explanation: 'Query for non-existent store',
        chartSpec: null,
      };

      const result = await executor.execute(queryResult);

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
      expect(result.truncated).toBe(false);
    });
  });

  describe('statement timeout', () => {
    it('throws AIError when query exceeds timeout', async () => {
      if (!dbAvailable) return;

      const executor = createQueryExecutor({ readonlyDb });
      const queryResult: AIQueryResult = {
        sql: 'SELECT pg_sleep(10) WHERE $1 = $1 LIMIT 1',
        params: [TEST_STORE_ID],
        explanation: 'Long-running query',
        chartSpec: null,
      };

      await expect(executor.execute(queryResult)).rejects.toThrow(
        /took too long to execute/,
      );
    });
  });

  describe('execution metadata', () => {
    it('returns durationMs reflecting actual execution time', async () => {
      if (!dbAvailable) return;

      const executor = createQueryExecutor({ readonlyDb });
      const queryResult: AIQueryResult = {
        sql: 'SELECT 1 AS val WHERE $1 = $1 LIMIT 1',
        params: [TEST_STORE_ID],
        explanation: 'Simple query',
        chartSpec: null,
      };

      const result = await executor.execute(queryResult);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeLessThan(5000); // should be well under timeout
    });
  });
});
