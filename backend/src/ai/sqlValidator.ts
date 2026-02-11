/**
 * SQL Validator — ensures AI-generated SQL is safe to execute.
 *
 * Rules:
 * 1. Must be SELECT-only (no INSERT, UPDATE, DELETE, DROP, etc.)
 * 2. Must reference store_id for tenant isolation
 * 3. Must have a LIMIT clause (appended if missing)
 * 4. Must not contain multi-statement SQL (semicolons)
 * 5. Must not contain UNION (injection vector)
 * 6. Must not contain SQL comments (-- or block comments)
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
] as const;

const DEFAULT_LIMIT = 100;

export function validateSql(sql: string): SqlValidationResult {
  const errors: string[] = [];

  if (!sql || !sql.trim()) {
    return { valid: false, sql: '', errors: ['SQL query is empty'] };
  }

  let normalised = sql.trim();

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

  // Must start with SELECT
  if (!upper.startsWith('SELECT')) {
    errors.push('Only SELECT queries are allowed');
  }

  // Check forbidden keywords using word-boundary matching
  for (const keyword of FORBIDDEN_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (pattern.test(normalised)) {
      errors.push(`Forbidden keyword detected: ${keyword}`);
    }
  }

  // Check for UNION (common SQL injection vector)
  if (/\bUNION\b/i.test(normalised)) {
    errors.push('UNION queries are not allowed');
  }

  // Must reference store_id
  if (!normalised.includes('store_id')) {
    errors.push('Query must include store_id for tenant isolation');
  }

  // Append LIMIT if missing
  if (!/\bLIMIT\b/i.test(normalised)) {
    normalised = `${normalised} LIMIT ${DEFAULT_LIMIT}`;
  }

  return {
    valid: errors.length === 0,
    sql: normalised,
    errors,
  };
}
