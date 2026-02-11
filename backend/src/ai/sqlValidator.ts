/**
 * SQL Validator — ensures AI-generated SQL is safe to execute.
 *
 * Rules:
 * 1. Must be SELECT-only (no INSERT, UPDATE, DELETE, DROP, etc.)
 * 2. Must filter by store_id = $1 for tenant isolation
 * 3. Must have a LIMIT clause (appended if missing, capped at 1000)
 * 4. Must not contain multi-statement SQL (semicolons)
 * 5. Must not contain UNION (injection vector)
 * 6. Must not contain SQL comments (-- or block comments)
 * 7. Must not use dangerous PostgreSQL functions
 * 8. Must not use SELECT INTO, WITH/CTE, COPY, SET, or RETURNING
 * 9. Must contain only ASCII characters
 */

import type { SqlValidationResult } from './types.js';

const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'TRUNCATE',
  'GRANT',
  'REVOKE',
  'EXEC',
  'EXECUTE',
  'COPY',
  'SET',
  'RESET',
  'CALL',
  'RETURNING',
] as const;

const FORBIDDEN_KEYWORD_PATTERNS = FORBIDDEN_KEYWORDS.map(
  (kw) => ({ keyword: kw, pattern: new RegExp(`\\b${kw}\\b`, 'i') }),
);

const DANGEROUS_FUNCTIONS = [
  'pg_read_file',
  'pg_read_binary_file',
  'pg_write_file',
  'pg_ls_dir',
  'pg_stat_file',
  'pg_sleep',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_reload_conf',
  'pg_rotate_logfile',
  'set_config',
  'dblink',
  'dblink_connect',
  'dblink_exec',
  'lo_import',
  'lo_export',
  'lo_get',
  'lo_put',
  'query_to_xml',
  'query_to_json',
] as const;

const DANGEROUS_FUNCTION_PATTERNS = DANGEROUS_FUNCTIONS.map(
  (fn) => ({ name: fn, pattern: new RegExp(`\\b${fn}\\b`, 'i') }),
);

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

export function validateSql(sql: string): SqlValidationResult {
  const errors: string[] = [];

  if (!sql || !sql.trim()) {
    return { valid: false, sql: '', errors: ['SQL query is empty'] };
  }

  let normalised = sql.trim();

  // Reject non-ASCII characters (prevent unicode homoglyph bypass)
  // eslint-disable-next-line no-control-regex
  if (/[^\x20-\x7E\t\n\r]/.test(normalised)) {
    errors.push('SQL must contain only ASCII characters');
  }

  // Strip trailing semicolons (common in AI output)
  normalised = normalised.replace(/;\s*$/, '');

  // Check for remaining semicolons (multi-statement)
  if (normalised.includes(';')) {
    errors.push('Multi-statement SQL is not allowed');
  }

  // Check for SQL comments that could hide malicious code
  if (normalised.includes('--') || /\/\*/.test(normalised)) {
    errors.push('SQL comments are not allowed');
  }

  const upper = normalised.toUpperCase();

  // Must start with SELECT (blocks WITH/CTE, COPY, SET, etc.)
  if (!upper.startsWith('SELECT')) {
    errors.push('Only SELECT queries are allowed');
  }

  // Block SELECT INTO (creates tables)
  if (/\bSELECT\b[\s\S]+\bINTO\b/i.test(normalised)) {
    errors.push('SELECT INTO is not allowed');
  }

  // Block WITH/CTE at start (could obfuscate write operations)
  if (/^\s*WITH\b/i.test(normalised)) {
    errors.push('CTE (WITH) queries are not allowed');
  }

  // Check forbidden keywords using pre-compiled patterns
  for (const { keyword, pattern } of FORBIDDEN_KEYWORD_PATTERNS) {
    if (pattern.test(normalised)) {
      errors.push(`Forbidden keyword detected: ${keyword}`);
    }
  }

  // Check for dangerous PostgreSQL functions
  for (const { name, pattern } of DANGEROUS_FUNCTION_PATTERNS) {
    if (pattern.test(normalised)) {
      errors.push(`Dangerous function detected: ${name}`);
    }
  }

  // Check for UNION (common SQL injection vector)
  if (/\bUNION\b/i.test(normalised)) {
    errors.push('UNION queries are not allowed');
  }

  // Must filter by store_id = $1 for tenant isolation (not just mention "store_id")
  if (!/\bstore_id\s*=\s*\$1\b/.test(normalised)) {
    errors.push('Query must filter by store_id = $1 for tenant isolation');
  }

  // Cap or append LIMIT
  const limitMatch = normalised.match(/\bLIMIT\s+(\d+)/i);
  if (limitMatch) {
    const limitValue = parseInt(limitMatch[1], 10);
    if (limitValue > MAX_LIMIT) {
      normalised = normalised.replace(/\bLIMIT\s+\d+/i, `LIMIT ${MAX_LIMIT}`);
    }
  } else {
    normalised = `${normalised} LIMIT ${DEFAULT_LIMIT}`;
  }

  return {
    valid: errors.length === 0,
    sql: normalised,
    errors,
  };
}
