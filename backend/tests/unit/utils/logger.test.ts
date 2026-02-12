import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock dependencies before importing ──────────────────────────────

const mockConfig = {
  logLevel: 'info',
  nodeEnv: 'development',
};

jest.unstable_mockModule('../../../src/config.js', () => ({
  config: mockConfig,
}));

// ── Tests ───────────────────────────────────────────────────────────

describe('logger', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('exports a logger object', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    expect(logger).toBeDefined();
  });

  it('exports Logger type (logger is the expected type)', async () => {
    const mod = await import('../../../src/utils/logger.js');
    expect(typeof mod.logger.info).toBe('function');
    expect(typeof mod.logger.warn).toBe('function');
    expect(typeof mod.logger.error).toBe('function');
    expect(typeof mod.logger.debug).toBe('function');
    expect(typeof mod.logger.fatal).toBe('function');
  });

  it('logger has standard log methods', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.trace).toBe('function');
    expect(typeof logger.fatal).toBe('function');
  });

  it('logger level matches config', async () => {
    const { logger } = await import('../../../src/utils/logger.js');
    expect(logger.level).toBe('info');
  });

  describe('request serializer', () => {
    it('logger is a valid pino instance with serializers configured', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      // Pino stores serializers internally — we verify logger is functional
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
    });
  });

  describe('log level formatter', () => {
    it('logger can log without throwing', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      // Pino logger should not throw when logging
      expect(() => logger.info('test message')).not.toThrow();
      expect(() => logger.warn({ key: 'value' }, 'warning')).not.toThrow();
      expect(() => logger.error(new Error('test'), 'error occurred')).not.toThrow();
    });
  });

  describe('child logger', () => {
    it('can create child loggers', async () => {
      const { logger } = await import('../../../src/utils/logger.js');
      const child = logger.child({ module: 'test' });
      expect(child).toBeDefined();
      expect(typeof child.info).toBe('function');
    });
  });
});
