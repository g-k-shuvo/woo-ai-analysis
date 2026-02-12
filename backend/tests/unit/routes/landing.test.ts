import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { landingRoutes, buildLandingHtml } from '../../../src/routes/landing.js';

// ── Helpers ─────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(async (instance) => landingRoutes(instance));
  await app.ready();
  return app;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Landing routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  // ── GET / — Landing page ────────────────────────────────────────

  describe('GET /', () => {
    describe('response status and content type', () => {
      it('returns 200 status code', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.statusCode).toBe(200);
      });

      it('returns text/html content type', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.headers['content-type']).toMatch(/text\/html/);
      });
    });

    describe('HTML structure', () => {
      it('contains DOCTYPE declaration', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toMatch(/^<!DOCTYPE html>/i);
      });

      it('contains html lang attribute', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('<html lang="en">');
      });

      it('contains meta charset', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('<meta charset="UTF-8">');
      });

      it('contains meta viewport for mobile', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('meta name="viewport"');
        expect(response.body).toContain('width=device-width');
      });

      it('contains head element', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('<head>');
        expect(response.body).toContain('</head>');
      });

      it('contains body element', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('<body>');
        expect(response.body).toContain('</body>');
      });

      it('contains closing html tag', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('</html>');
      });
    });

    describe('product content', () => {
      it('contains product name "Woo AI Analytics"', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Woo AI Analytics');
      });

      it('contains title with product name', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toMatch(/<title>.*Woo AI Analytics.*<\/title>/);
      });

      it('contains product description', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('WooCommerce');
        expect(response.body).toContain('natural language');
      });

      it('contains CTA link', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Install the Plugin');
      });
    });

    describe('feature highlights', () => {
      it('mentions Natural Language Queries', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Natural Language Queries');
      });

      it('mentions Interactive Charts', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Interactive Charts');
      });

      it('mentions Revenue & Order Analytics', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Revenue');
        expect(response.body).toContain('Order Analytics');
      });

      it('mentions Product Insights', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Product Insights');
      });

      it('mentions Customer Intelligence', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Customer Intelligence');
      });

      it('mentions Security', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Secure');
      });
    });

    describe('how it works section', () => {
      it('contains how it works heading', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('How It Works');
      });

      it('contains step 1 — Install', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Install the Plugin');
      });

      it('contains step 2 — Connect & Sync', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Connect');
        expect(response.body).toContain('Sync');
      });

      it('contains step 3 — Ask Questions', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Ask Questions');
      });

      it('contains step 4 — Get Insights', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('Get Insights');
      });
    });

    describe('responsive design', () => {
      it('contains inline CSS (self-contained)', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('<style>');
        expect(response.body).toContain('</style>');
      });

      it('contains media query for mobile', async () => {
        const response = await app.inject({ method: 'GET', url: '/' });
        expect(response.body).toContain('@media');
        expect(response.body).toContain('max-width');
      });
    });

    describe('route configuration', () => {
      it('returns 404 for POST method', async () => {
        const response = await app.inject({ method: 'POST', url: '/', payload: {} });
        expect(response.statusCode).toBe(404);
      });

      it('returns 404 for PUT method', async () => {
        const response = await app.inject({ method: 'PUT', url: '/', payload: {} });
        expect(response.statusCode).toBe(404);
      });

      it('returns 404 for DELETE method', async () => {
        const response = await app.inject({ method: 'DELETE', url: '/' });
        expect(response.statusCode).toBe(404);
      });
    });
  });

  // ── GET /api/info — API info endpoint ───────────────────────────

  describe('GET /api/info', () => {
    describe('response status and content type', () => {
      it('returns 200 status code', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/info' });
        expect(response.statusCode).toBe(200);
      });

      it('returns application/json content type', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/info' });
        expect(response.headers['content-type']).toMatch(/application\/json/);
      });
    });

    describe('response body', () => {
      it('contains name field', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/info' });
        const body = JSON.parse(response.body);
        expect(body.name).toBe('Woo AI Analytics');
      });

      it('contains version field matching package.json', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/info' });
        const body = JSON.parse(response.body);
        expect(body.version).toBe('1.0.0');
      });

      it('contains description field', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/info' });
        const body = JSON.parse(response.body);
        expect(body.description).toBe('AI-powered conversational analytics for WooCommerce');
      });

      it('contains status field as running', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/info' });
        const body = JSON.parse(response.body);
        expect(body.status).toBe('running');
      });

      it('contains documentation field with correct URL', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/info' });
        const body = JSON.parse(response.body);
        expect(body.documentation).toBe('https://github.com/g-k-shuvo/woo-ai-analysis');
      });

      it('returns exactly 5 fields', async () => {
        const response = await app.inject({ method: 'GET', url: '/api/info' });
        const body = JSON.parse(response.body);
        expect(Object.keys(body)).toHaveLength(5);
      });
    });

    describe('route configuration', () => {
      it('returns 404 for POST method', async () => {
        const response = await app.inject({ method: 'POST', url: '/api/info', payload: {} });
        expect(response.statusCode).toBe(404);
      });

      it('returns 404 for DELETE method', async () => {
        const response = await app.inject({ method: 'DELETE', url: '/api/info' });
        expect(response.statusCode).toBe(404);
      });
    });
  });

  // ── buildLandingHtml unit tests ─────────────────────────────────

  describe('buildLandingHtml()', () => {
    it('returns a non-empty string', () => {
      const html = buildLandingHtml();
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    it('starts with DOCTYPE', () => {
      const html = buildLandingHtml();
      expect(html).toMatch(/^<!DOCTYPE html>/i);
    });

    it('contains version number in footer', () => {
      const html = buildLandingHtml();
      expect(html).toMatch(/v\d+\.\d+\.\d+/);
    });

    it('uses provided version in footer', () => {
      const html = buildLandingHtml('2.3.4');
      expect(html).toContain('v2.3.4');
    });

    it('contains semantic header element', () => {
      const html = buildLandingHtml();
      expect(html).toContain('<header');
      expect(html).toContain('</header>');
    });

    it('contains semantic footer element', () => {
      const html = buildLandingHtml();
      expect(html).toContain('<footer');
      expect(html).toContain('</footer>');
    });

    it('contains section elements', () => {
      const html = buildLandingHtml();
      expect(html).toContain('<section');
      expect(html).toContain('</section>');
    });

    it('does not contain external stylesheet links', () => {
      const html = buildLandingHtml();
      expect(html).not.toMatch(/<link[^>]+rel=["']stylesheet["']/i);
    });

    it('does not contain external script tags', () => {
      const html = buildLandingHtml();
      expect(html).not.toMatch(/<script[^>]+src=/i);
    });
  });
});
