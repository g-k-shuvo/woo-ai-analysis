import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { loadConfig } from '../../src/config.js';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('loads default config values', () => {
    const config = loadConfig();
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.logLevel).toBe('info');
    expect(typeof config.nodeEnv).toBe('string');
  });

  it('reads PORT from env', () => {
    process.env.PORT = '4000';
    const config = loadConfig();
    expect(config.port).toBe(4000);
  });

  it('reads DATABASE_URL from env', () => {
    process.env.DATABASE_URL = 'postgresql://custom:pass@db:5432/mydb';
    const config = loadConfig();
    expect(config.database.url).toBe('postgresql://custom:pass@db:5432/mydb');
  });

  it('reads REDIS_URL from env', () => {
    process.env.REDIS_URL = 'redis://custom-redis:6380';
    const config = loadConfig();
    expect(config.redis.url).toBe('redis://custom-redis:6380');
  });

  it('reads LOG_LEVEL from env', () => {
    process.env.LOG_LEVEL = 'debug';
    const config = loadConfig();
    expect(config.logLevel).toBe('debug');
  });
});
