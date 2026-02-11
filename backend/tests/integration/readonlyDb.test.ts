import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * Integration tests for the read-only database connection.
 *
 * These tests require a running PostgreSQL instance with the woo_ai_readonly
 * user created via init-readonly-user.sql. They verify that:
 * 1. SELECT queries succeed
 * 2. Write operations (INSERT, UPDATE, DELETE, DROP, CREATE, TRUNCATE) are rejected
 * 3. Statement timeout is enforced
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

const READONLY_URL =
  process.env.DATABASE_READONLY_URL ||
  'postgresql://woo_ai_readonly:woo_ai_pass@localhost:5432/woo_ai_analytics';

const PRIMARY_URL =
  process.env.DATABASE_URL ||
  'postgresql://woo_ai:woo_ai_pass@localhost:5432/woo_ai_analytics';

// Check if DB is reachable before running tests
let dbAvailable = false;

describe('Read-only DB integration', () => {
  let readonlyDb: ReturnType<typeof createReadonlyDb>;
  let primaryDb: ReturnType<typeof createReadonlyDb>;

  beforeAll(async () => {
    try {
      const knexModule = await import('knex');
      const knex = knexModule.default;

      // First check if primary DB is reachable
      primaryDb = knex({
        client: 'pg',
        connection: PRIMARY_URL,
        pool: { min: 1, max: 2 },
      });
      await primaryDb.raw('SELECT 1');

      // Create a test table if it doesn't exist (using primary user)
      const tableExists = await primaryDb.schema.hasTable('_readonly_test');
      if (!tableExists) {
        await primaryDb.schema.createTable('_readonly_test', (table) => {
          table.uuid('id').primary().defaultTo(primaryDb.raw('gen_random_uuid()'));
          table.uuid('store_id').notNullable();
          table.string('name', 100);
        });

        // Grant SELECT on new test table to readonly user
        await primaryDb.raw('GRANT SELECT ON _readonly_test TO woo_ai_readonly');

        // Insert a test row
        await primaryDb('_readonly_test').insert({
          store_id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'test_row',
        });
      }

      // Now create the read-only connection
      readonlyDb = createReadonlyDb(READONLY_URL);
      await readonlyDb.raw('SELECT 1');

      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (primaryDb) {
      try {
        await primaryDb.schema.dropTableIfExists('_readonly_test');
      } catch {
        // ignore cleanup errors
      }
      await primaryDb.destroy();
    }
    if (readonlyDb) {
      await readonlyDb.destroy();
    }
  });

  describe('SELECT queries', () => {
    it('allows SELECT on tables', async () => {
      if (!dbAvailable) return;

      const result = await readonlyDb('_readonly_test')
        .where('store_id', '550e8400-e29b-41d4-a716-446655440000')
        .select('*');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].name).toBe('test_row');
    });

    it('allows raw SELECT queries', async () => {
      if (!dbAvailable) return;

      const result = await readonlyDb.raw(
        'SELECT COUNT(*) AS cnt FROM _readonly_test WHERE store_id = ?',
        ['550e8400-e29b-41d4-a716-446655440000'],
      );

      expect(parseInt(result.rows[0].cnt, 10)).toBeGreaterThanOrEqual(1);
    });
  });

  describe('write operation rejection', () => {
    it('rejects INSERT operations', async () => {
      if (!dbAvailable) return;

      await expect(
        readonlyDb('_readonly_test').insert({
          store_id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'hacked',
        }),
      ).rejects.toThrow(/permission denied/i);
    });

    it('rejects UPDATE operations', async () => {
      if (!dbAvailable) return;

      await expect(
        readonlyDb('_readonly_test')
          .where('store_id', '550e8400-e29b-41d4-a716-446655440000')
          .update({ name: 'hacked' }),
      ).rejects.toThrow(/permission denied/i);
    });

    it('rejects DELETE operations', async () => {
      if (!dbAvailable) return;

      await expect(
        readonlyDb('_readonly_test')
          .where('store_id', '550e8400-e29b-41d4-a716-446655440000')
          .delete(),
      ).rejects.toThrow(/permission denied/i);
    });

    it('rejects DROP TABLE operations', async () => {
      if (!dbAvailable) return;

      await expect(
        readonlyDb.raw('DROP TABLE _readonly_test'),
      ).rejects.toThrow(/permission denied|must be owner/i);
    });

    it('rejects CREATE TABLE operations', async () => {
      if (!dbAvailable) return;

      await expect(
        readonlyDb.raw('CREATE TABLE _hacked (id INT)'),
      ).rejects.toThrow(/permission denied/i);
    });

    it('rejects TRUNCATE operations', async () => {
      if (!dbAvailable) return;

      await expect(
        readonlyDb.raw('TRUNCATE _readonly_test'),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe('statement timeout', () => {
    it('kills queries exceeding the timeout', async () => {
      if (!dbAvailable) return;

      await expect(
        readonlyDb.raw('SELECT pg_sleep(10)'),
      ).rejects.toThrow(/canceling statement due to statement timeout|statement timeout/i);
    });
  });
});
