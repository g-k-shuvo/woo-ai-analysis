import { describe, it, expect } from '@jest/globals';
import { validateSql } from '../../../src/ai/sqlValidator.js';

describe('validateSql', () => {
  // ── Valid queries ──────────────────────────────────────────
  describe('valid queries', () => {
    it('accepts a valid SELECT with store_id and LIMIT', () => {
      const sql = "SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sql).toBe(sql);
    });

    it('accepts a complex JOIN query with store_id and LIMIT', () => {
      const sql =
        "SELECT p.name, SUM(oi.total) AS revenue FROM order_items oi JOIN products p ON oi.product_id = p.id AND p.store_id = $1 WHERE oi.store_id = $1 GROUP BY p.name ORDER BY revenue DESC LIMIT 10";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accepts a query with subselects', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1 AND customer_id IN (SELECT id FROM customers WHERE store_id = $1) LIMIT 100";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
    });

    it('is case-insensitive for SELECT keyword', () => {
      const sql = "select count(*) from orders where store_id = $1 limit 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
    });

    it('strips trailing semicolons', () => {
      const sql = "SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1;";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.sql).not.toContain(';');
    });

    it('strips trailing semicolons with whitespace', () => {
      const sql =
        "SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1;  ";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.sql).not.toContain(';');
    });
  });

  // ── LIMIT enforcement ──────────────────────────────────────
  describe('LIMIT enforcement', () => {
    it('appends LIMIT 100 when no LIMIT clause is present', () => {
      const sql = "SELECT * FROM orders WHERE store_id = $1";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.sql).toContain('LIMIT 100');
    });

    it('preserves existing LIMIT when present', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1 LIMIT 10";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.sql).toBe(sql);
      expect(result.sql).not.toContain('LIMIT 100');
    });

    it('detects case-insensitive LIMIT', () => {
      const sql = "SELECT * FROM orders WHERE store_id = $1 limit 5";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.sql).not.toContain('LIMIT 100');
    });
  });

  // ── SELECT-only enforcement ────────────────────────────────
  describe('SELECT-only enforcement', () => {
    it('rejects INSERT queries', () => {
      const sql =
        "INSERT INTO orders (store_id) VALUES ('abc')";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Only SELECT queries are allowed');
      expect(result.errors.some((e) => e.includes('INSERT'))).toBe(true);
    });

    it('rejects UPDATE queries', () => {
      const sql =
        "UPDATE orders SET total = 0 WHERE store_id = $1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Only SELECT queries are allowed');
      expect(result.errors.some((e) => e.includes('UPDATE'))).toBe(true);
    });

    it('rejects DELETE queries', () => {
      const sql = "DELETE FROM orders WHERE store_id = $1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('DELETE'))).toBe(true);
    });

    it('rejects DROP queries', () => {
      const sql = "DROP TABLE orders";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('DROP'))).toBe(true);
    });

    it('rejects ALTER queries', () => {
      const sql = "ALTER TABLE orders ADD COLUMN store_id UUID";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('ALTER'))).toBe(true);
    });

    it('rejects CREATE queries', () => {
      const sql = "CREATE TABLE hack (id INT) WHERE store_id = $1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('CREATE'))).toBe(true);
    });

    it('rejects TRUNCATE queries', () => {
      const sql = "TRUNCATE orders WHERE store_id = $1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('TRUNCATE'))).toBe(true);
    });

    it('rejects GRANT queries', () => {
      const sql = "GRANT ALL ON orders TO hacker WHERE store_id = $1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('GRANT'))).toBe(true);
    });

    it('rejects REVOKE queries', () => {
      const sql = "REVOKE ALL ON orders FROM user1 WHERE store_id = $1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('REVOKE'))).toBe(true);
    });

    it('rejects EXEC queries', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1; EXEC xp_cmdshell('cmd')";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('EXEC'))).toBe(true);
    });

    it('rejects EXECUTE queries', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1; EXECUTE some_proc";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('EXECUTE'))).toBe(true);
    });

    it('detects forbidden keywords case-insensitively', () => {
      const sql =
        "select * from orders where store_id = $1; insert into orders values (1)";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('INSERT'))).toBe(true);
    });
  });

  // ── store_id enforcement ───────────────────────────────────
  describe('store_id enforcement', () => {
    it('rejects SQL without store_id reference', () => {
      const sql = "SELECT COUNT(*) FROM orders LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Query must include store_id for tenant isolation',
      );
    });

    it('accepts store_id in different positions', () => {
      const sql =
        "SELECT * FROM orders o WHERE o.store_id = $1 LIMIT 10";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
    });
  });

  // ── Injection prevention ───────────────────────────────────
  describe('injection prevention', () => {
    it('rejects multi-statement SQL (semicolons in middle)', () => {
      const sql =
        "SELECT 1 FROM orders WHERE store_id = $1; DROP TABLE orders";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Multi-statement SQL is not allowed');
    });

    it('rejects UNION-based injection', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1 UNION SELECT * FROM pg_catalog.pg_tables LIMIT 100";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('UNION queries are not allowed');
    });

    it('rejects SQL with line comments (--)', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1 -- AND status = 'active' LIMIT 100";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SQL comments are not allowed');
    });

    it('rejects SQL with block comments (/* */)', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1 /* hack */ LIMIT 100";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SQL comments are not allowed');
    });

    it('rejects UNION ALL injection', () => {
      const sql =
        "SELECT id FROM orders WHERE store_id = $1 UNION ALL SELECT password FROM users LIMIT 100";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('UNION queries are not allowed');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────
  describe('edge cases', () => {
    it('rejects empty string', () => {
      const result = validateSql('');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SQL query is empty');
    });

    it('rejects whitespace-only string', () => {
      const result = validateSql('   ');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SQL query is empty');
    });

    it('trims leading/trailing whitespace', () => {
      const sql =
        "  SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1  ";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.sql).toBe(sql.trim());
    });

    it('collects multiple errors for multiply-invalid SQL', () => {
      const sql = "DELETE FROM orders";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      // Should have: not SELECT, forbidden DELETE, no store_id
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });

    it('does not flag "updated_at" column as UPDATE', () => {
      const sql =
        "SELECT updated_at FROM products WHERE store_id = $1 LIMIT 10";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('does not flag "date_created" containing CREATE substring', () => {
      const sql =
        "SELECT date_created FROM orders WHERE store_id = $1 LIMIT 10";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
    });

    it('does not flag "execution_time" containing EXEC substring', () => {
      const sql =
        "SELECT execution_time FROM orders WHERE store_id = $1 LIMIT 10";
      const result = validateSql(sql);

      // execution_time does NOT match \bEXEC\b because there is no word boundary after EXEC
      // Actually "execution_time" would NOT match \bEXEC\b because 'u' follows 'c'
      // But \bEXECUTE\b would not match "execution_time" either
      // Let's verify the validator handles this correctly
      expect(result.valid).toBe(true);
    });
  });
});
