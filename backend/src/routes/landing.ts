import type { FastifyInstance } from 'fastify';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

export async function landingRoutes(fastify: FastifyInstance) {
  // GET / — Public landing page
  fastify.get('/', async (_request, reply) => {
    const html = buildLandingHtml(pkg.version);
    return reply.status(200).type('text/html').send(html);
  });

  // GET /api/info — Public API info endpoint
  fastify.get('/api/info', async (_request, reply) => {
    return reply.status(200).send({
      name: 'Woo AI Analytics',
      version: pkg.version,
      description: 'AI-powered conversational analytics for WooCommerce',
      status: 'running',
      documentation: 'https://github.com/g-k-shuvo/woo-ai-analysis',
    });
  });
}

export function buildLandingHtml(version: string = pkg.version): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Woo AI Analytics — AI-Powered Conversational Analytics for WooCommerce</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #1a1a2e;
      background: #f8f9fa;
    }
    a { color: #7c3aed; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Header */
    .header {
      background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
      color: #fff;
      padding: 3rem 1.5rem;
      text-align: center;
    }
    .header h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 0.75rem; }
    .header p { font-size: 1.25rem; opacity: 0.9; max-width: 640px; margin: 0 auto 2rem; }
    .cta-btn {
      display: inline-block;
      background: #fff;
      color: #7c3aed;
      font-weight: 700;
      padding: 0.75rem 2rem;
      border-radius: 8px;
      font-size: 1.05rem;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); text-decoration: none; }

    /* Features */
    .features {
      max-width: 960px;
      margin: 3rem auto;
      padding: 0 1.5rem;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 2rem;
    }
    .feature-card {
      background: #fff;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .feature-card h3 { font-size: 1.15rem; margin-bottom: 0.5rem; color: #4f46e5; }
    .feature-card p { font-size: 0.95rem; color: #4b5563; }

    /* How it works */
    .how-it-works {
      max-width: 960px;
      margin: 3rem auto;
      padding: 0 1.5rem;
      text-align: center;
    }
    .how-it-works h2 { font-size: 1.75rem; margin-bottom: 2rem; }
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
    }
    .step { padding: 1.5rem; }
    .step-num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: #7c3aed;
      color: #fff;
      border-radius: 50%;
      font-weight: 700;
      font-size: 1.1rem;
      margin-bottom: 0.75rem;
    }
    .step h4 { font-size: 1.05rem; margin-bottom: 0.5rem; }
    .step p { font-size: 0.9rem; color: #4b5563; }

    /* Footer */
    .footer {
      text-align: center;
      padding: 2rem 1.5rem;
      color: #6b7280;
      font-size: 0.85rem;
      border-top: 1px solid #e5e7eb;
      margin-top: 3rem;
    }

    @media (max-width: 600px) {
      .header h1 { font-size: 1.75rem; }
      .header p { font-size: 1rem; }
    }
  </style>
</head>
<body>
  <header class="header">
    <h1>Woo AI Analytics</h1>
    <p>Chat with your WooCommerce data using natural language. Get instant answers, charts, and insights powered by AI.</p>
    <a href="https://wordpress.org/plugins/" class="cta-btn">Install the Plugin</a>
  </header>

  <section class="features">
    <div class="feature-card">
      <h3>Natural Language Queries</h3>
      <p>Ask questions like &ldquo;What was my revenue last month?&rdquo; and get instant, accurate answers from your store data.</p>
    </div>
    <div class="feature-card">
      <h3>Interactive Charts</h3>
      <p>Automatically generated bar, line, pie, and doughnut charts. Switch between chart types or view raw data tables.</p>
    </div>
    <div class="feature-card">
      <h3>Revenue &amp; Order Analytics</h3>
      <p>Track total revenue, average order value, order status breakdowns, and compare performance across time periods.</p>
    </div>
    <div class="feature-card">
      <h3>Product Insights</h3>
      <p>Discover top sellers, category performance, stock levels, and product trends without writing a single query.</p>
    </div>
    <div class="feature-card">
      <h3>Customer Intelligence</h3>
      <p>Understand new vs returning customers, top spenders, customer lifetime value, and geographic distribution.</p>
    </div>
    <div class="feature-card">
      <h3>Secure &amp; Private</h3>
      <p>Read-only database access, SQL injection prevention, store data isolation, and PII anonymization built in.</p>
    </div>
  </section>

  <section class="how-it-works">
    <h2>How It Works</h2>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <h4>Install the Plugin</h4>
        <p>Add Woo AI Analytics to your WordPress site from the plugin directory.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <h4>Connect &amp; Sync</h4>
        <p>Connect your store and sync your WooCommerce data securely to the analytics backend.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <h4>Ask Questions</h4>
        <p>Open the chat in your WP admin and ask anything about your store data in plain English.</p>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <h4>Get Insights</h4>
        <p>Receive AI-generated answers with charts, tables, and actionable analytics instantly.</p>
      </div>
    </div>
  </section>

  <footer class="footer">
    <p>Woo AI Analytics v${version} &mdash; AI-powered conversational analytics for WooCommerce</p>
  </footer>
</body>
</html>`;
}
