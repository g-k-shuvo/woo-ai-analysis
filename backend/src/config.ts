import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env') });

export interface AppConfig {
  port: number;
  host: string;
  logLevel: string;
  nodeEnv: string;
  database: {
    url: string;
    readonlyUrl: string;
  };
  redis: {
    url: string;
  };
  openai: {
    apiKey: string;
  };
  rateLimit: {
    chatMaxRequests: number;
    chatWindowSeconds: number;
  };
}

function requireEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(requireEnv('PORT', '3000'), 10),
    host: requireEnv('HOST', '0.0.0.0'),
    logLevel: requireEnv('LOG_LEVEL', 'info'),
    nodeEnv: requireEnv('NODE_ENV', 'development'),
    database: {
      url: requireEnv(
        'DATABASE_URL',
        'postgresql://woo_ai:woo_ai_pass@localhost:5432/woo_ai_analytics',
      ),
      readonlyUrl: requireEnv(
        'DATABASE_READONLY_URL',
        'postgresql://woo_ai_readonly:woo_ai_pass@localhost:5432/woo_ai_analytics',
      ),
    },
    redis: {
      url: requireEnv('REDIS_URL', 'redis://localhost:6379'),
    },
    openai: {
      apiKey: requireEnv('OPENAI_API_KEY', ''),
    },
    rateLimit: {
      chatMaxRequests: parseInt(requireEnv('RATE_LIMIT_CHAT_MAX', '20'), 10),
      chatWindowSeconds: parseInt(requireEnv('RATE_LIMIT_CHAT_WINDOW', '60'), 10),
    },
  };
}

export const config = loadConfig();
