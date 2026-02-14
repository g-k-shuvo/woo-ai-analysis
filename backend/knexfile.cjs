/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

module.exports = {
  development: {
    client: 'pg',
    connection:
      process.env.DATABASE_URL ||
      'postgresql://woo_ai:woo_ai_pass@localhost:5433/woo_ai_analytics',
    migrations: {
      directory: path.resolve(__dirname, 'db', 'migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.resolve(__dirname, 'db', 'seeds'),
      extension: 'ts',
    },
    pool: { min: 2, max: 10 },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: path.resolve(__dirname, 'db', 'migrations'),
      extension: 'ts',
    },
    pool: { min: 2, max: 20 },
  },
};
