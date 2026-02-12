import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { landingRoutes } from '../../src/routes/landing.js';

/**
 * Integration tests for the landing page routes.
 *
 * These tests exercise the full route pipeline through a real Fastify
 * instance (not mocked) to verify:
 * - Routes register and respond correctly
 * - Content types are set properly
 * - HTML is well-formed and complete
 * - JSON response schema is correct
 * - No auth is required for either endpoint
 */

// ── Helpers ─────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(async (instance) => landingRoutes(instance));
  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Landing page integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── GET / — Full HTML pipeline ──────────────────────────────────

  describe('GET / — Landing page', () => {
    it('returns 200 with text/html content type', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
    });

    it('returns valid HTML document with DOCTYPE, head, and body', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      const html = response.body;

      expect(html).toMatch(/^<!DOCTYPE html>/i);
      expect(html).toContain('<head>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</body>');
      expect(html).toContain('</html>');
    });

    it('includes proper meta tags', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.body).toContain('charset="UTF-8"');
      expect(response.body).toContain('name="viewport"');
    });

    it('includes product name and description', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.body).toContain('Woo AI Analytics');
      expect(response.body).toContain('WooCommerce');
    });

    it('includes all six feature cards', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      const features = [
        'Natural Language Queries',
        'Interactive Charts',
        'Revenue',
        'Product Insights',
        'Customer Intelligence',
        'Secure',
      ];
      for (const feature of features) {
        expect(response.body).toContain(feature);
      }
    });

    it('includes the how-it-works section with 4 steps', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.body).toContain('How It Works');
      // Check all 4 step numbers are present
      for (let i = 1; i <= 4; i++) {
        expect(response.body).toContain(`>${i}<`);
      }
    });

    it('has self-contained CSS with no external resources', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.body).toContain('<style>');
      expect(response.body).not.toMatch(/<link[^>]+href=["']http/i);
      expect(response.body).not.toMatch(/<script[^>]+src=/i);
    });

    it('is accessible without Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: {}, // No auth headers
      });
      expect(response.statusCode).toBe(200);
    });

    it('returns reasonably sized response (>1KB, <100KB)', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      const size = Buffer.byteLength(response.body, 'utf-8');
      expect(size).toBeGreaterThan(1024);
      expect(size).toBeLessThan(102400);
    });
  });

  // ── GET /api/info — JSON API info ───────────────────────────────

  describe('GET /api/info — API info', () => {
    it('returns 200 with application/json content type', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/info' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    it('returns valid JSON response', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/info' });
      expect(() => JSON.parse(response.body)).not.toThrow();
    });

    it('contains all required fields with correct types', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/info' });
      const body = JSON.parse(response.body);

      expect(body).toEqual({
        name: expect.any(String),
        version: expect.any(String),
        description: expect.any(String),
        status: expect.any(String),
        documentation: expect.any(String),
      });
    });

    it('returns correct product name and status', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/info' });
      const body = JSON.parse(response.body);

      expect(body.name).toBe('Woo AI Analytics');
      expect(body.status).toBe('running');
    });

    it('returns valid semver version', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/info' });
      const body = JSON.parse(response.body);

      expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('is accessible without Authorization header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/info',
        headers: {},
      });
      expect(response.statusCode).toBe(200);
    });
  });

  // ── Cross-cutting concerns ──────────────────────────────────────

  describe('Cross-cutting concerns', () => {
    it('landing page and info endpoint coexist in same plugin', async () => {
      const [landingRes, infoRes] = await Promise.all([
        app.inject({ method: 'GET', url: '/' }),
        app.inject({ method: 'GET', url: '/api/info' }),
      ]);
      expect(landingRes.statusCode).toBe(200);
      expect(infoRes.statusCode).toBe(200);
      expect(landingRes.headers['content-type']).toMatch(/text\/html/);
      expect(infoRes.headers['content-type']).toMatch(/application\/json/);
    });

    it('non-existent routes return 404', async () => {
      const response = await app.inject({ method: 'GET', url: '/non-existent' });
      expect(response.statusCode).toBe(404);
    });
  });
});
