import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock knex before importing the module under test ──────────────

const mockRawQuery = jest.fn<(sql: string, cb: (err: Error | null) => void) => void>();

const mockKnexInstance = {
  client: 'pg',
  destroy: jest.fn<() => Promise<void>>(),
  raw: jest.fn<() => Promise<unknown>>(),
  select: jest.fn<() => unknown>(),
};

const mockKnex = jest.fn<() => typeof mockKnexInstance>().mockReturnValue(mockKnexInstance);

jest.unstable_mockModule('knex', () => ({
  default: mockKnex,
}));

jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { createReadonlyDb } = await import('../../../src/db/readonlyConnection.js');

describe('createReadonlyDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKnex.mockReturnValue(mockKnexInstance);
  });

  it('creates a Knex instance with pg client', () => {
    createReadonlyDb('postgresql://readonly:pass@localhost:5432/testdb');

    expect(mockKnex).toHaveBeenCalledTimes(1);
    const config = (mockKnex.mock.calls as unknown[][])[0][0] as {
      client: string;
    };
    expect(config.client).toBe('pg');
  });

  it('uses the provided connection URL', () => {
    const url = 'postgresql://woo_ai_readonly:secret@db.example.com:5432/woo_ai_analytics';
    createReadonlyDb(url);

    const config = (mockKnex.mock.calls as unknown[][])[0][0] as {
      connection: string;
    };
    expect(config.connection).toBe(url);
  });

  it('sets pool min to 1', () => {
    createReadonlyDb('postgresql://readonly:pass@localhost:5432/testdb');

    const config = (mockKnex.mock.calls as unknown[][])[0][0] as {
      pool: { min: number };
    };
    expect(config.pool.min).toBe(1);
  });

  it('sets pool max to 5', () => {
    createReadonlyDb('postgresql://readonly:pass@localhost:5432/testdb');

    const config = (mockKnex.mock.calls as unknown[][])[0][0] as {
      pool: { max: number };
    };
    expect(config.pool.max).toBe(5);
  });

  it('configures afterCreate hook for statement_timeout', () => {
    createReadonlyDb('postgresql://readonly:pass@localhost:5432/testdb');

    const config = (mockKnex.mock.calls as unknown[][])[0][0] as {
      pool: {
        afterCreate: (
          conn: { query: typeof mockRawQuery },
          done: (err: Error | null, conn: unknown) => void,
        ) => void;
      };
    };
    expect(typeof config.pool.afterCreate).toBe('function');

    // Simulate the afterCreate callback
    const mockConn = { query: mockRawQuery };
    const mockDone = jest.fn<(err: Error | null, conn: unknown) => void>();

    // Make query call the callback immediately with no error
    mockRawQuery.mockImplementation((_sql, cb) => {
      cb(null);
    });

    config.pool.afterCreate(mockConn, mockDone);

    expect(mockRawQuery).toHaveBeenCalledWith(
      'SET statement_timeout = 5000',
      expect.any(Function),
    );
    expect(mockDone).toHaveBeenCalledWith(null, mockConn);
  });

  it('passes connection errors through afterCreate done callback', () => {
    createReadonlyDb('postgresql://readonly:pass@localhost:5432/testdb');

    const config = (mockKnex.mock.calls as unknown[][])[0][0] as {
      pool: {
        afterCreate: (
          conn: { query: typeof mockRawQuery },
          done: (err: Error | null, conn: unknown) => void,
        ) => void;
      };
    };

    const mockConn = { query: mockRawQuery };
    const mockDone = jest.fn<(err: Error | null, conn: unknown) => void>();
    const connError = new Error('Connection failed');

    mockRawQuery.mockImplementation((_sql, cb) => {
      cb(connError);
    });

    config.pool.afterCreate(mockConn, mockDone);

    expect(mockDone).toHaveBeenCalledWith(connError, mockConn);
  });

  it('returns the Knex instance', () => {
    const result = createReadonlyDb('postgresql://readonly:pass@localhost:5432/testdb');
    expect(result).toBe(mockKnexInstance);
  });

  it('logs pool creation info', async () => {
    const { logger } = await import('../../../src/utils/logger.js');

    createReadonlyDb('postgresql://readonly:pass@localhost:5432/testdb');

    expect(logger.info).toHaveBeenCalledWith(
      { poolMin: 1, poolMax: 5, statementTimeoutMs: 5000 },
      'Read-only database connection pool created',
    );
  });
});
