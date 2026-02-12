import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

// ── Mock logger ─────────────────────────────────────────────────────

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── Dynamic imports (after mocks) ───────────────────────────────────

const { createScheduledInsightsService } = await import(
  '../../src/services/scheduledInsightsService.js'
);
const { scheduledInsightsRoutes } = await import(
  '../../src/routes/scheduledInsights/index.js'
);
const { registerErrorHandler } = await import('../../src/middleware/errorHandler.js');

// ── In-memory "database" ───────────────────────────────────────────

interface InsightRow {
  id: string;
  store_id: string;
  name: string;
  frequency: string;
  hour: number;
  day_of_week: number | null;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

let insightRows: InsightRow[] = [];
let nextId = 1;

const STORE_ID_A = 'aaaa0000-0000-0000-0000-000000000001';
const STORE_ID_B = 'bbbb0000-0000-0000-0000-000000000002';

function makeInsightId(): string {
  const n = String(nextId++).padStart(4, '0');
  return `dddd0000-0000-0000-0000-dddd0000${n}`;
}

// ── Fake Knex query builder ─────────────────────────────────────────

function createFakeDb() {
  function createBuilder(tableName: string) {
    let whereFilter: Record<string, unknown> = {};
    let orderByCol: string | null = null;
    let orderByDir: string = 'asc';
    let countMode = false;

    function getRows(): InsightRow[] {
      if (tableName === 'scheduled_insights') return insightRows;
      return [];
    }

    function filterRows(): InsightRow[] {
      let rows = [...getRows()];

      for (const [key, val] of Object.entries(whereFilter)) {
        rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[key] === val);
      }

      if (orderByCol) {
        const col = orderByCol;
        const dir = orderByDir;
        rows.sort((a, b) => {
          const aVal = (a as unknown as Record<string, unknown>)[col] as string;
          const bVal = (b as unknown as Record<string, unknown>)[col] as string;
          if (aVal < bVal) return dir === 'asc' ? -1 : 1;
          if (aVal > bVal) return dir === 'asc' ? 1 : -1;
          return 0;
        });
      }

      return rows;
    }

    const builder: Record<string, unknown> = {
      where(filter: Record<string, unknown>) {
        whereFilter = { ...whereFilter, ...filter };
        return builder;
      },
      andWhere(filter: Record<string, unknown>) {
        whereFilter = { ...whereFilter, ...filter };
        return builder;
      },
      orderBy(col: string, dir: string) {
        orderByCol = col;
        orderByDir = dir || 'asc';
        return builder;
      },
      count(_expr: string) {
        countMode = true;
        return builder;
      },
      select(..._cols: string[]) {
        return Promise.resolve(filterRows());
      },
      first() {
        if (countMode) {
          countMode = false;
          const count = filterRows().length;
          return Promise.resolve({ count: String(count) });
        }
        const row = filterRows()[0];
        return Promise.resolve(row);
      },
      insert(data: Record<string, unknown>) {
        const newRow: InsightRow = {
          id: makeInsightId(),
          store_id: data.store_id as string,
          name: data.name as string,
          frequency: data.frequency as string,
          hour: data.hour as number,
          day_of_week: (data.day_of_week as number | null) ?? null,
          enabled: data.enabled as boolean,
          last_run_at: null,
          next_run_at: (data.next_run_at as string | null) ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        insightRows.push(newRow);
        return {
          returning() {
            return Promise.resolve([newRow]);
          },
        };
      },
      update(data: Record<string, unknown>) {
        const rows = filterRows();
        for (const row of rows) {
          for (const [key, val] of Object.entries(data)) {
            (row as unknown as Record<string, unknown>)[key] = val;
          }
        }
        return {
          returning() {
            return Promise.resolve(rows);
          },
        };
      },
      del() {
        const rows = filterRows();
        const count = rows.length;
        for (const row of rows) {
          const idx = insightRows.indexOf(row);
          if (idx >= 0) insightRows.splice(idx, 1);
        }
        return Promise.resolve(count);
      },
    };

    return builder;
  }

  const fakeDb = function (tableName: string) {
    return createBuilder(tableName);
  } as unknown as ((tableName: string) => Record<string, unknown>) & {
    transaction: (cb: (trx: unknown) => Promise<unknown>) => Promise<unknown>;
  };

  // transaction() passes fakeDb as the trx argument
  fakeDb.transaction = async (cb: (trx: unknown) => Promise<unknown>) => {
    return cb(fakeDb);
  };

  return fakeDb;
}

// ── App builder ──────────────────────────────────────────────────────

async function buildApp(storeId: string): Promise<FastifyInstance> {
  const fakeDb = createFakeDb();
  const scheduledInsightsService = createScheduledInsightsService({
    db: fakeDb as unknown as Parameters<typeof createScheduledInsightsService>[0]['db'],
  });

  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  app.decorateRequest('store', undefined);
  app.addHook('onRequest', async (request) => {
    request.store = {
      id: storeId,
      store_url: 'https://example.com',
      plan: 'free',
      is_active: true,
    };
  });

  await app.register(async (instance) =>
    scheduledInsightsRoutes(instance, { scheduledInsightsService }),
  );

  await app.ready();
  return app;
}

function seedInsight(storeId: string, overrides: Partial<InsightRow> = {}): string {
  const id = makeInsightId();
  insightRows.push({
    id,
    store_id: storeId,
    name: 'Seeded Insight',
    frequency: 'daily',
    hour: 8,
    day_of_week: null,
    enabled: true,
    last_run_at: null,
    next_run_at: '2026-02-13T08:00:00.000Z',
    created_at: '2026-02-12T10:00:00.000Z',
    updated_at: '2026-02-12T10:00:00.000Z',
    ...overrides,
  });
  return id;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Scheduled Insights Integration', () => {
  beforeEach(() => {
    insightRows = [];
    nextId = 1;
  });

  // ── CRUD flow ─────────────────────────────────────────────────────

  describe('Full CRUD flow', () => {
    it('creates, lists, updates, and deletes an insight', async () => {
      const app = await buildApp(STORE_ID_A);

      // Create
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: { name: 'Daily Revenue', frequency: 'daily', hour: 8 },
      });

      expect(createRes.statusCode).toBe(201);
      const created = JSON.parse(createRes.body);
      expect(created.success).toBe(true);
      expect(created.data.name).toBe('Daily Revenue');
      expect(created.data.frequency).toBe('daily');
      expect(created.data.hour).toBe(8);
      expect(created.data.enabled).toBe(true);
      expect(created.data.nextRunAt).toBeTruthy();

      const insightId = created.data.id;

      // List
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/scheduled-insights',
      });

      expect(listRes.statusCode).toBe(200);
      const listed = JSON.parse(listRes.body);
      expect(listed.data.insights).toHaveLength(1);
      expect(listed.data.insights[0].id).toBe(insightId);

      // Update
      const updateRes = await app.inject({
        method: 'PUT',
        url: `/api/scheduled-insights/${insightId}`,
        payload: { name: 'Updated Name', hour: 10 },
      });

      expect(updateRes.statusCode).toBe(200);
      const updated = JSON.parse(updateRes.body);
      expect(updated.data.name).toBe('Updated Name');
      expect(updated.data.hour).toBe(10);

      // Delete
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/scheduled-insights/${insightId}`,
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.body).data.deleted).toBe(true);

      // Verify deleted
      const listRes2 = await app.inject({
        method: 'GET',
        url: '/api/scheduled-insights',
      });

      expect(JSON.parse(listRes2.body).data.insights).toHaveLength(0);
    });
  });

  // ── Create ────────────────────────────────────────────────────────

  describe('POST /api/scheduled-insights', () => {
    it('creates a daily insight', async () => {
      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: { name: 'Daily Revenue', frequency: 'daily', hour: 9 },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.frequency).toBe('daily');
      expect(body.data.dayOfWeek).toBeNull();
    });

    it('creates a weekly insight with dayOfWeek', async () => {
      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: {
          name: 'Weekly Summary',
          frequency: 'weekly',
          hour: 9,
          dayOfWeek: 1,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.frequency).toBe('weekly');
      expect(body.data.dayOfWeek).toBe(1);
    });

    it('returns 400 for missing name', async () => {
      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: { frequency: 'daily', hour: 8 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid frequency', async () => {
      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: { name: 'Test', frequency: 'monthly', hour: 8 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for invalid hour', async () => {
      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: { name: 'Test', frequency: 'daily', hour: 25 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('enforces max 5 schedules per store', async () => {
      const app = await buildApp(STORE_ID_A);

      // Create 5 insights
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/scheduled-insights',
          payload: { name: `Insight ${i}`, frequency: 'daily', hour: i },
        });
        expect(res.statusCode).toBe(201);
      }

      // 6th should fail
      const res = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: { name: 'One too many', frequency: 'daily', hour: 8 },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.message).toContain('Maximum of 5');
    });

    it('creates disabled insight with null next_run_at', async () => {
      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: {
          name: 'Disabled',
          frequency: 'daily',
          hour: 8,
          enabled: false,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.enabled).toBe(false);
      expect(body.data.nextRunAt).toBeNull();
    });
  });

  // ── List ──────────────────────────────────────────────────────────

  describe('GET /api/scheduled-insights', () => {
    it('returns empty array when no insights', async () => {
      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'GET',
        url: '/api/scheduled-insights',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.insights).toEqual([]);
    });

    it('returns only insights for the authenticated store', async () => {
      seedInsight(STORE_ID_A, { name: 'Store A Insight' });
      seedInsight(STORE_ID_B, { name: 'Store B Insight' });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'GET',
        url: '/api/scheduled-insights',
      });

      const body = JSON.parse(response.body);
      expect(body.data.insights).toHaveLength(1);
      expect(body.data.insights[0].name).toBe('Store A Insight');
    });

    it('returns multiple insights', async () => {
      seedInsight(STORE_ID_A, { name: 'First' });
      seedInsight(STORE_ID_A, { name: 'Second' });
      seedInsight(STORE_ID_A, { name: 'Third' });

      const app = await buildApp(STORE_ID_A);
      const response = await app.inject({
        method: 'GET',
        url: '/api/scheduled-insights',
      });

      const body = JSON.parse(response.body);
      expect(body.data.insights).toHaveLength(3);
    });
  });

  // ── Update ────────────────────────────────────────────────────────

  describe('PUT /api/scheduled-insights/:id', () => {
    it('updates insight name', async () => {
      const id = seedInsight(STORE_ID_A);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/scheduled-insights/${id}`,
        payload: { name: 'New Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe('New Name');
    });

    it('updates enabled to false and clears next_run_at', async () => {
      const id = seedInsight(STORE_ID_A);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/scheduled-insights/${id}`,
        payload: { enabled: false },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.enabled).toBe(false);
      expect(body.data.nextRunAt).toBeNull();
    });

    it('returns 404 for non-existent insight', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/scheduled-insights/dddd0000-0000-0000-0000-dddd00009999',
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('enforces store isolation on update', async () => {
      const id = seedInsight(STORE_ID_B, { name: 'Store B Insight' });
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/scheduled-insights/${id}`,
        payload: { name: 'Stolen!' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for invalid frequency', async () => {
      const id = seedInsight(STORE_ID_A);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/scheduled-insights/${id}`,
        payload: { frequency: 'monthly' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ── Delete ────────────────────────────────────────────────────────

  describe('DELETE /api/scheduled-insights/:id', () => {
    it('deletes an existing insight', async () => {
      const id = seedInsight(STORE_ID_A);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/scheduled-insights/${id}`,
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).data.deleted).toBe(true);
      expect(insightRows).toHaveLength(0);
    });

    it('returns 404 for non-existent insight', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/scheduled-insights/dddd0000-0000-0000-0000-dddd00009999',
      });

      expect(response.statusCode).toBe(404);
    });

    it('enforces store isolation on delete', async () => {
      const id = seedInsight(STORE_ID_B);
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/scheduled-insights/${id}`,
      });

      expect(response.statusCode).toBe(404);
      // Insight should still exist
      expect(insightRows).toHaveLength(1);
    });
  });

  // ── Weekly schedule specifics ─────────────────────────────────────

  describe('Weekly schedule behavior', () => {
    it('requires dayOfWeek for weekly creation', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: { name: 'Weekly', frequency: 'weekly', hour: 8 },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.message).toContain('Day of week is required');
    });

    it('stores dayOfWeek for weekly schedule', async () => {
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'POST',
        url: '/api/scheduled-insights',
        payload: {
          name: 'Monday Report',
          frequency: 'weekly',
          hour: 9,
          dayOfWeek: 1,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.dayOfWeek).toBe(1);
    });

    it('clears dayOfWeek when changing from weekly to daily', async () => {
      const id = seedInsight(STORE_ID_A, {
        frequency: 'weekly',
        day_of_week: 3,
      });
      const app = await buildApp(STORE_ID_A);

      const response = await app.inject({
        method: 'PUT',
        url: `/api/scheduled-insights/${id}`,
        payload: { frequency: 'daily' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.dayOfWeek).toBeNull();
    });
  });
});
