import { describe, it, expect } from '@jest/globals';
import {
  buildSystemPrompt,
  SCHEMA_DEFINITION,
  CRITICAL_RULES,
  RESPONSE_FORMAT,
} from '../../../src/ai/prompts/system.js';
import type { StoreContext } from '../../../src/ai/schemaContext.js';

function makeStoreContext(overrides: Partial<StoreContext> = {}): StoreContext {
  return {
    storeId: 'store-abc-123',
    currency: 'USD',
    totalOrders: 150,
    totalProducts: 42,
    totalCustomers: 80,
    totalCategories: 5,
    earliestOrderDate: '2025-01-15T00:00:00Z',
    latestOrderDate: '2026-02-10T23:59:59Z',
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('returns a non-empty string', () => {
    const prompt = buildSystemPrompt(makeStoreContext());
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  // ── Schema inclusion ─────────────────────────────────────
  describe('schema definition', () => {
    it('includes the orders table schema', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('### orders');
      expect(prompt).toContain('store_id (UUID)');
      expect(prompt).toContain('date_created (TIMESTAMPTZ)');
      expect(prompt).toContain('total (DECIMAL)');
    });

    it('includes the order_items table schema', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('### order_items');
      expect(prompt).toContain('product_id (UUID)');
      expect(prompt).toContain('quantity (INTEGER)');
    });

    it('includes the products table schema', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('### products');
      expect(prompt).toContain('name (VARCHAR)');
      expect(prompt).toContain('stock_quantity (INTEGER)');
    });

    it('includes the customers table schema', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('### customers');
      expect(prompt).toContain('display_name (VARCHAR)');
      expect(prompt).toContain('total_spent (DECIMAL)');
    });

    it('includes the categories table schema', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('### categories');
      expect(prompt).toContain('product_count (INTEGER)');
    });

    it('includes the coupons table schema', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('### coupons');
      expect(prompt).toContain('discount_type (VARCHAR)');
    });

    it('mentions all 6 queryable tables', () => {
      const tables = [
        '### orders',
        '### order_items',
        '### products',
        '### customers',
        '### categories',
        '### coupons',
      ];
      const prompt = buildSystemPrompt(makeStoreContext());
      for (const table of tables) {
        expect(prompt).toContain(table);
      }
    });
  });

  // ── Store metadata ────────────────────────────────────────
  describe('store metadata', () => {
    it('includes the store ID', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('store-abc-123');
    });

    it('includes the store currency', () => {
      const prompt = buildSystemPrompt(
        makeStoreContext({ currency: 'EUR' }),
      );
      expect(prompt).toContain('Store currency: EUR');
    });

    it('includes total orders count', () => {
      const prompt = buildSystemPrompt(
        makeStoreContext({ totalOrders: 150 }),
      );
      expect(prompt).toContain('Total orders: 150');
    });

    it('includes total products count', () => {
      const prompt = buildSystemPrompt(
        makeStoreContext({ totalProducts: 42 }),
      );
      expect(prompt).toContain('Total products: 42');
    });

    it('includes total customers count', () => {
      const prompt = buildSystemPrompt(
        makeStoreContext({ totalCustomers: 80 }),
      );
      expect(prompt).toContain('Total customers: 80');
    });

    it('includes total categories count', () => {
      const prompt = buildSystemPrompt(
        makeStoreContext({ totalCategories: 5 }),
      );
      expect(prompt).toContain('Total categories: 5');
    });

    it('includes date range when orders exist', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain(
        'Date range available: 2025-01-15T00:00:00Z to 2026-02-10T23:59:59Z',
      );
    });

    it('shows "No orders yet" when dates are null', () => {
      const prompt = buildSystemPrompt(
        makeStoreContext({
          earliestOrderDate: null,
          latestOrderDate: null,
        }),
      );
      expect(prompt).toContain('Date range available: No orders yet');
    });
  });

  // ── Critical rules ────────────────────────────────────────
  describe('critical rules', () => {
    it('includes the store_id isolation rule', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('WHERE store_id = $1');
    });

    it('includes the SELECT-only rule', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('Only generate SELECT queries');
    });

    it('forbids dangerous SQL keywords', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      const forbidden = [
        'INSERT',
        'UPDATE',
        'DELETE',
        'DROP',
        'ALTER',
        'CREATE',
        'TRUNCATE',
        'GRANT',
        'REVOKE',
      ];
      for (const keyword of forbidden) {
        expect(prompt).toContain(keyword);
      }
    });

    it('includes the LIMIT rule', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('LIMIT');
    });

    it('includes PII protection rule', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('NEVER return raw customer emails or PII');
    });

    it('includes rounding rule for monetary values', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('ROUND(value, 2)');
    });
  });

  // ── Response format ───────────────────────────────────────
  describe('response format', () => {
    it('includes JSON response format instruction', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('Response Format');
      expect(prompt).toContain('"sql"');
      expect(prompt).toContain('"params"');
      expect(prompt).toContain('"explanation"');
      expect(prompt).toContain('"chartSpec"');
    });

    it('includes chart type options', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('bar|line|pie|doughnut|table');
    });
  });

  // ── Few-shot examples ─────────────────────────────────────
  describe('few-shot examples', () => {
    it('includes example questions and SQL section', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('Example Questions and SQL');
    });

    it('includes at least one revenue example', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('What is my total revenue?');
    });

    it('includes at least one product example', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('top 10 selling products');
    });

    it('includes at least one customer example', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('new vs returning customers');
    });

    it('includes at least one order example', () => {
      const prompt = buildSystemPrompt(makeStoreContext());
      expect(prompt).toContain('orders did I get today');
    });
  });

  // ── Exported constants ────────────────────────────────────
  describe('exported constants', () => {
    it('exports SCHEMA_DEFINITION as a string', () => {
      expect(typeof SCHEMA_DEFINITION).toBe('string');
      expect(SCHEMA_DEFINITION.length).toBeGreaterThan(0);
    });

    it('exports CRITICAL_RULES as a string', () => {
      expect(typeof CRITICAL_RULES).toBe('string');
      expect(CRITICAL_RULES.length).toBeGreaterThan(0);
    });

    it('exports RESPONSE_FORMAT as a string', () => {
      expect(typeof RESPONSE_FORMAT).toBe('string');
      expect(RESPONSE_FORMAT.length).toBeGreaterThan(0);
    });
  });
});
