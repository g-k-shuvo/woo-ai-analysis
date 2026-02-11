/**
 * Read-only database connection for AI-generated query execution.
 *
 * Uses a separate PostgreSQL user (woo_ai_readonly) with SELECT-only privileges.
 * Enforces a 5-second statement timeout to prevent long-running queries.
 */

import knex, { type Knex } from 'knex';
import { logger } from '../utils/logger.js';

const STATEMENT_TIMEOUT_MS = 5000;
const POOL_MIN = 1;
const POOL_MAX = 5;

export function createReadonlyDb(connectionUrl: string): Knex {
  const db = knex({
    client: 'pg',
    connection: connectionUrl,
    pool: {
      min: POOL_MIN,
      max: POOL_MAX,
      afterCreate(
        conn: { query: (sql: string, cb: (err: Error | null) => void) => void },
        done: (err: Error | null, conn: unknown) => void,
      ) {
        conn.query(
          `SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`,
          (err: Error | null) => {
            done(err, conn);
          },
        );
      },
    },
  });

  logger.info(
    { poolMin: POOL_MIN, poolMax: POOL_MAX, statementTimeoutMs: STATEMENT_TIMEOUT_MS },
    'Read-only database connection pool created',
  );

  return db;
}
