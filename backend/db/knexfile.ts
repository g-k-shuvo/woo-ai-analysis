import type { Knex } from 'knex';
import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env') });

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection:
      process.env.DATABASE_URL ||
      'postgresql://woo_ai:woo_ai_pass@localhost:5433/woo_ai_analytics',
    migrations: {
      directory: resolve(__dirname, 'migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: resolve(__dirname, 'seeds'),
      extension: 'ts',
    },
    pool: { min: 2, max: 10 },
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: resolve(__dirname, 'migrations'),
      extension: 'ts',
    },
    pool: { min: 2, max: 20 },
  },
};

export default config;
