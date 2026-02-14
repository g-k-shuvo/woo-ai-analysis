/**
 * Query Executor — runs AI-validated SQL against the read-only database connection.
 *
 * Accepts an AIQueryResult (from the NL→SQL pipeline) and executes it via
 * the read-only Knex connection. Returns rows, rowCount, and execution duration.
 *
 * Security:
 * - Only pre-validated SELECT queries are executed (enforced by sqlValidator)
 * - Parameterized store_id ($1) prevents SQL injection
 * - Read-only PostgreSQL user prevents any write operations
 * - 5-second statement timeout prevents long-running queries
 */

import type { Knex } from 'knex';
import type { AIQueryResult, QueryExecutionResult } from './types.js';
import { AIError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const MAX_ROWS = 1000;

export interface QueryExecutorDeps {
  readonlyDb: Knex;
}

export function createQueryExecutor(deps: QueryExecutorDeps) {
  const { readonlyDb } = deps;

  async function execute(queryResult: AIQueryResult): Promise<QueryExecutionResult> {
    const { sql, params } = queryResult;

    if (!sql || !sql.trim()) {
      throw new AIError('Cannot execute empty SQL query.');
    }

    if (!params.length) {
      throw new AIError('Query params must include at least store_id.');
    }

    logger.info(
      { sqlLength: sql.length, paramCount: params.length },
      'Query executor: starting execution',
    );

    const startTime = Date.now();

    try {
      // Replace PostgreSQL-style $N placeholders with Knex ? placeholders
      const knexSql = sql.replace(/\$(\d+)/g, '?');
      const result = await readonlyDb.raw(knexSql, params);

      const durationMs = Date.now() - startTime;
      let rows: Record<string, unknown>[] = result.rows ?? [];

      // Truncate to MAX_ROWS if the result set is too large
      let truncated = false;
      if (rows.length > MAX_ROWS) {
        logger.warn(
          { originalCount: rows.length, maxRows: MAX_ROWS },
          'Query executor: result set truncated',
        );
        truncated = true;
        rows = rows.slice(0, MAX_ROWS);
      }

      const rowCount = rows.length;

      logger.info(
        { durationMs, rowCount },
        'Query executor: execution completed',
      );

      return { rows, rowCount, durationMs, truncated };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const cause = err instanceof Error ? err : new Error(String(err));

      logger.error(
        { durationMs, error: cause.message },
        'Query executor: execution failed',
      );

      // Classify errors for user-friendly messages
      if (/canceling statement due to statement timeout|statement timeout/i.test(cause.message)) {
        throw new AIError(
          'The query took too long to execute. Try asking a simpler question.',
          { cause },
        );
      }

      if (/permission denied/i.test(cause.message)) {
        throw new AIError(
          'Query execution failed due to a permissions error.',
          { cause },
        );
      }

      if (/syntax error/i.test(cause.message)) {
        throw new AIError(
          'The generated query contained a syntax error. Please try rephrasing your question.',
          { cause },
        );
      }

      throw new AIError(
        'Query execution failed unexpectedly.',
        { cause },
      );
    }
  }

  return { execute };
}

export type QueryExecutor = ReturnType<typeof createQueryExecutor>;
