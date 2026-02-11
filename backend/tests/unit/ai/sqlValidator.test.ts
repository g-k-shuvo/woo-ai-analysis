import { describe, it, expect } from '@jest/globals';
import { validateSql } from '../../../src/ai/sqlValidator.js';

describe('validateSql', () => {
  // ── Valid queries ──────────────────────────────────────────
  describe('valid queries', () => {
    it('accepts a valid SELECT with store_id = $1 and LIMIT', () => {
      const sql = "SELECT COUNT(*) FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.sql).toBe(sql);
    });

    it('accepts a complex JOIN query with store_id = $1 and LIMIT', () => {
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

    it('caps LIMIT values exceeding 1000', () => {
      const sql = "SELECT * FROM orders WHERE store_id = $1 LIMIT 999999";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.sql).toContain('LIMIT 1000');
      expect(result.sql).not.toContain('999999');
    });

    it('preserves LIMIT values at or below 1000', () => {
      const sql = "SELECT * FROM orders WHERE store_id = $1 LIMIT 1000";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
      expect(result.sql).toContain('LIMIT 1000');
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
      const sql = "CREATE TABLE hack (id INT)";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('CREATE'))).toBe(true);
    });

    it('rejects TRUNCATE queries', () => {
      const sql = "TRUNCATE orders";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('TRUNCATE'))).toBe(true);
    });

    it('rejects GRANT queries', () => {
      const sql = "GRANT ALL ON orders TO hacker";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('GRANT'))).toBe(true);
    });

    it('rejects REVOKE queries', () => {
      const sql = "REVOKE ALL ON orders FROM user1";
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

    it('rejects COPY queries', () => {
      const sql = "COPY orders TO '/tmp/data.csv'";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('COPY'))).toBe(true);
    });

    it('rejects CALL queries', () => {
      const sql = "CALL some_procedure()";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('CALL'))).toBe(true);
    });

    it('rejects RETURNING clause', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1; DELETE FROM orders RETURNING *";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('RETURNING'))).toBe(true);
    });

    it('detects forbidden keywords case-insensitively', () => {
      const sql =
        "select * from orders where store_id = $1; insert into orders values (1)";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('INSERT'))).toBe(true);
    });
  });

  // ── SELECT INTO prevention ────────────────────────────────
  describe('SELECT INTO prevention', () => {
    it('rejects SELECT INTO (table creation)', () => {
      const sql =
        "SELECT * INTO attacker_table FROM customers WHERE store_id = $1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SELECT INTO is not allowed');
    });

    it('rejects SELECT ... INTO with columns', () => {
      const sql =
        "SELECT id, name INTO new_table FROM orders WHERE store_id = $1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SELECT INTO is not allowed');
    });
  });

  // ── CTE (WITH) prevention ─────────────────────────────────
  describe('CTE (WITH) prevention', () => {
    it('rejects WITH/CTE queries', () => {
      const sql =
        "WITH cte AS (SELECT * FROM orders WHERE store_id = $1) SELECT * FROM cte LIMIT 100";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('CTE (WITH) queries are not allowed');
    });

    it('rejects WITH wrapping a write operation', () => {
      const sql =
        "WITH cte AS (DELETE FROM orders WHERE store_id = $1 RETURNING *) SELECT * FROM cte LIMIT 100";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('CTE (WITH) queries are not allowed');
    });
  });

  // ── Dangerous PostgreSQL functions ────────────────────────
  describe('dangerous PostgreSQL functions', () => {
    it('rejects pg_read_file', () => {
      const sql =
        "SELECT pg_read_file('/etc/passwd') AS data FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('pg_read_file'))).toBe(true);
    });

    it('rejects pg_read_binary_file', () => {
      const sql =
        "SELECT pg_read_binary_file('/etc/shadow') FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('pg_read_binary_file'))).toBe(true);
    });

    it('rejects pg_ls_dir', () => {
      const sql =
        "SELECT pg_ls_dir('/tmp') AS files FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('pg_ls_dir'))).toBe(true);
    });

    it('rejects set_config (privilege escalation)', () => {
      const sql =
        "SELECT set_config('role', 'postgres', false) FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('set_config'))).toBe(true);
    });

    it('rejects pg_sleep (DoS vector)', () => {
      const sql =
        "SELECT pg_sleep(999) FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('pg_sleep'))).toBe(true);
    });

    it('rejects dblink (remote connections)', () => {
      const sql =
        "SELECT dblink('host=evil.com', 'SELECT 1') FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('dblink'))).toBe(true);
    });

    it('rejects lo_export (large object exfiltration)', () => {
      const sql =
        "SELECT lo_export(12345, '/tmp/dump') FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('lo_export'))).toBe(true);
    });

    it('rejects pg_terminate_backend', () => {
      const sql =
        "SELECT pg_terminate_backend(12345) FROM orders WHERE store_id = $1 LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('pg_terminate_backend'))).toBe(true);
    });
  });

  // ── SET/RESET enforcement ──────────────────────────────────
  describe('SET/RESET enforcement', () => {
    it('rejects SET statements', () => {
      const sql = "SET ROLE admin";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('SET'))).toBe(true);
    });

    it('rejects RESET statements', () => {
      const sql = "RESET ROLE";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('RESET'))).toBe(true);
    });
  });

  // ── store_id enforcement ───────────────────────────────────
  describe('store_id enforcement', () => {
    it('rejects SQL without store_id = $1', () => {
      const sql = "SELECT COUNT(*) FROM orders LIMIT 1";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Query must filter by store_id = $1 for tenant isolation',
      );
    });

    it('accepts store_id = $1 in different positions', () => {
      const sql =
        "SELECT * FROM orders o WHERE o.store_id = $1 LIMIT 10";
      const result = validateSql(sql);

      expect(result.valid).toBe(true);
    });

    it('rejects store_id as string literal only (bypass attempt)', () => {
      const sql =
        "SELECT 'store_id' AS label, COUNT(*) FROM orders LIMIT 100";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Query must filter by store_id = $1 for tenant isolation',
      );
    });

    it('rejects store_id as column alias (bypass attempt)', () => {
      const sql =
        "SELECT id AS store_id FROM orders LIMIT 100";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Query must filter by store_id = $1 for tenant isolation',
      );
    });

    it('rejects hardcoded store_id value (must use $1 parameter)', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = '550e8400-e29b-41d4-a716-446655440000' LIMIT 10";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Query must filter by store_id = $1 for tenant isolation',
      );
    });

    it('accepts store_id = $1 with spaces around equals', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id=$1 LIMIT 10";
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

  // ── ASCII enforcement ─────────────────────────────────────
  describe('ASCII enforcement', () => {
    it('rejects SQL with unicode characters', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1 AND name = '\u0421ELECT' LIMIT 10";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SQL must contain only ASCII characters');
    });

    it('rejects fullwidth characters used to bypass keyword detection', () => {
      const sql =
        "SELECT * FROM orders WHERE store_id = $1 AND col = '\uff24ELET' LIMIT 10";
      const result = validateSql(sql);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SQL must contain only ASCII characters');
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
      // Should have: not SELECT, forbidden DELETE, no store_id = $1
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

      expect(result.valid).toBe(true);
    });
  });
});
