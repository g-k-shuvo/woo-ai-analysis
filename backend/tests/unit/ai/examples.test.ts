import { describe, it, expect } from '@jest/globals';
import {
  getFewShotExamples,
  formatFewShotExamples,
} from '../../../src/ai/prompts/examples.js';
import type { FewShotExample } from '../../../src/ai/prompts/examples.js';

describe('getFewShotExamples', () => {
  let examples: readonly FewShotExample[];

  beforeAll(() => {
    examples = getFewShotExamples();
  });

  it('returns a non-empty array', () => {
    expect(Array.isArray(examples)).toBe(true);
    expect(examples.length).toBeGreaterThan(0);
  });

  it('returns at least 10 examples', () => {
    expect(examples.length).toBeGreaterThanOrEqual(10);
  });

  it('returns the same readonly array reference', () => {
    const a = getFewShotExamples();
    const b = getFewShotExamples();
    expect(a).toBe(b);
  });

  // ── Category coverage ─────────────────────────────────────
  describe('category coverage', () => {
    it('has revenue examples', () => {
      const revenue = examples.filter((e) => e.category === 'revenue');
      expect(revenue.length).toBeGreaterThanOrEqual(2);
    });

    it('has product examples', () => {
      const product = examples.filter((e) => e.category === 'product');
      expect(product.length).toBeGreaterThanOrEqual(2);
    });

    it('has customer examples', () => {
      const customer = examples.filter((e) => e.category === 'customer');
      expect(customer.length).toBeGreaterThanOrEqual(2);
    });

    it('has order examples', () => {
      const order = examples.filter((e) => e.category === 'order');
      expect(order.length).toBeGreaterThanOrEqual(2);
    });

    it('covers all 4 categories', () => {
      const categories = new Set(examples.map((e) => e.category));
      expect(categories).toEqual(
        new Set(['revenue', 'product', 'customer', 'order']),
      );
    });
  });

  // ── SQL safety ────────────────────────────────────────────
  describe('SQL safety', () => {
    it('every example SQL contains store_id = $1', () => {
      for (const ex of examples) {
        expect(ex.sql).toContain('store_id = $1');
      }
    });

    it('every example SQL starts with SELECT', () => {
      for (const ex of examples) {
        expect(ex.sql.trimStart().toUpperCase()).toMatch(/^SELECT/);
      }
    });

    it('no example SQL contains INSERT', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).not.toMatch(/\bINSERT\b/);
      }
    });

    it('no example SQL contains UPDATE', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).not.toMatch(/\bUPDATE\b/);
      }
    });

    it('no example SQL contains DELETE', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).not.toMatch(/\bDELETE\b/);
      }
    });

    it('no example SQL contains DROP', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).not.toMatch(/\bDROP\b/);
      }
    });

    it('no example SQL contains ALTER', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).not.toMatch(/\bALTER\b/);
      }
    });

    it('no example SQL contains CREATE', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).not.toMatch(/\bCREATE\b/);
      }
    });

    it('no example SQL contains TRUNCATE', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).not.toMatch(/\bTRUNCATE\b/);
      }
    });

    it('no example SQL contains GRANT', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).not.toMatch(/\bGRANT\b/);
      }
    });

    it('no example SQL contains REVOKE', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).not.toMatch(/\bREVOKE\b/);
      }
    });

    it('every example SQL contains LIMIT', () => {
      for (const ex of examples) {
        expect(ex.sql.toUpperCase()).toContain('LIMIT');
      }
    });
  });

  // ── Structure validation ──────────────────────────────────
  describe('structure validation', () => {
    it('every example has a non-empty question', () => {
      for (const ex of examples) {
        expect(typeof ex.question).toBe('string');
        expect(ex.question.length).toBeGreaterThan(0);
      }
    });

    it('every example has a non-empty sql', () => {
      for (const ex of examples) {
        expect(typeof ex.sql).toBe('string');
        expect(ex.sql.length).toBeGreaterThan(0);
      }
    });

    it('every example has a non-empty explanation', () => {
      for (const ex of examples) {
        expect(typeof ex.explanation).toBe('string');
        expect(ex.explanation.length).toBeGreaterThan(0);
      }
    });

    it('every example has a valid category', () => {
      const validCategories = ['revenue', 'product', 'customer', 'order'];
      for (const ex of examples) {
        expect(validCategories).toContain(ex.category);
      }
    });
  });

  // ── PII protection ────────────────────────────────────────
  describe('PII protection', () => {
    it('no example SQL queries email or email_hash directly', () => {
      for (const ex of examples) {
        // Should not SELECT email columns
        expect(ex.sql.toLowerCase()).not.toMatch(/\bemail\b/);
        expect(ex.sql.toLowerCase()).not.toMatch(/\bemail_hash\b/);
      }
    });
  });
});

describe('formatFewShotExamples', () => {
  it('returns a formatted string', () => {
    const formatted = formatFewShotExamples();
    expect(typeof formatted).toBe('string');
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('includes section header', () => {
    const formatted = formatFewShotExamples();
    expect(formatted).toContain('## Example Questions and SQL');
  });

  it('includes Q: and SQL: prefixes', () => {
    const formatted = formatFewShotExamples();
    expect(formatted).toContain('Q: ');
    expect(formatted).toContain('SQL: ');
    expect(formatted).toContain('Explanation: ');
  });

  it('includes all examples', () => {
    const formatted = formatFewShotExamples();
    const examples = getFewShotExamples();
    for (const ex of examples) {
      expect(formatted).toContain(ex.question);
    }
  });
});
