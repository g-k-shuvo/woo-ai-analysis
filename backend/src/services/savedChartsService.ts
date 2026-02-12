import type { Knex } from 'knex';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const MAX_CHARTS_PER_STORE = 20;
const MAX_TITLE_LENGTH = 255;
const MAX_QUERY_TEXT_LENGTH = 2000;

export interface SavedChartRecord {
  id: string;
  store_id: string;
  title: string;
  query_text: string | null;
  chart_config: Record<string, unknown>;
  position_index: number;
  created_at: string;
  updated_at: string;
}

export interface SaveChartInput {
  title: string;
  queryText?: string;
  chartConfig: Record<string, unknown>;
}

export interface UpdateChartInput {
  title?: string;
  chartConfig?: Record<string, unknown>;
}

export interface PositionUpdate {
  id: string;
  positionIndex: number;
}

export interface SavedChartResponse {
  id: string;
  title: string;
  queryText: string | null;
  chartConfig: Record<string, unknown>;
  positionIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface SavedChartsServiceDeps {
  db: Knex;
}

function toResponse(record: SavedChartRecord): SavedChartResponse {
  return {
    id: record.id,
    title: record.title,
    queryText: record.query_text,
    chartConfig: record.chart_config,
    positionIndex: record.position_index,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

export function createSavedChartsService(deps: SavedChartsServiceDeps) {
  const { db } = deps;

  async function saveChart(storeId: string, input: SaveChartInput): Promise<SavedChartResponse> {
    if (!input.title || typeof input.title !== 'string' || !input.title.trim()) {
      throw new ValidationError('Title is required');
    }

    if (input.title.length > MAX_TITLE_LENGTH) {
      throw new ValidationError(`Title must not exceed ${MAX_TITLE_LENGTH} characters`);
    }

    if (!input.chartConfig || typeof input.chartConfig !== 'object') {
      throw new ValidationError('chartConfig is required and must be an object');
    }

    if (input.queryText && input.queryText.length > MAX_QUERY_TEXT_LENGTH) {
      throw new ValidationError(`queryText must not exceed ${MAX_QUERY_TEXT_LENGTH} characters`);
    }

    // Check chart limit
    const countResult = await db('saved_charts')
      .where({ store_id: storeId })
      .count('* as count')
      .first<{ count: string }>();

    const currentCount = parseInt(countResult?.count ?? '0', 10);
    if (currentCount >= MAX_CHARTS_PER_STORE) {
      throw new ValidationError(
        `Maximum of ${MAX_CHARTS_PER_STORE} saved charts reached. Please delete a chart before saving a new one.`,
      );
    }

    // Determine next position index
    const maxPositionResult = await db('saved_charts')
      .where({ store_id: storeId })
      .max('position_index as max_pos')
      .first<{ max_pos: number | null }>();

    const nextPosition = (maxPositionResult?.max_pos ?? -1) + 1;

    const [inserted] = await db('saved_charts')
      .insert({
        store_id: storeId,
        title: input.title.trim(),
        query_text: input.queryText?.trim() || null,
        chart_config: JSON.stringify(input.chartConfig),
        position_index: nextPosition,
      })
      .returning('*');

    // Parse chart_config back from string if needed
    const record = {
      ...inserted,
      chart_config:
        typeof inserted.chart_config === 'string'
          ? JSON.parse(inserted.chart_config)
          : inserted.chart_config,
    } as SavedChartRecord;

    logger.info({ storeId, chartId: record.id }, 'Chart saved to dashboard');
    return toResponse(record);
  }

  async function listCharts(storeId: string): Promise<SavedChartResponse[]> {
    const records = await db('saved_charts')
      .where({ store_id: storeId })
      .orderBy('position_index', 'asc')
      .select<SavedChartRecord[]>('*');

    return records.map((r) => {
      const config =
        typeof r.chart_config === 'string' ? JSON.parse(r.chart_config) : r.chart_config;
      return toResponse({ ...r, chart_config: config });
    });
  }

  async function getChart(storeId: string, chartId: string): Promise<SavedChartResponse> {
    const record = await db('saved_charts')
      .where({ id: chartId, store_id: storeId })
      .first<SavedChartRecord | undefined>();

    if (!record) {
      throw new NotFoundError('Saved chart not found');
    }

    const config =
      typeof record.chart_config === 'string'
        ? JSON.parse(record.chart_config)
        : record.chart_config;

    return toResponse({ ...record, chart_config: config });
  }

  async function updateChart(
    storeId: string,
    chartId: string,
    input: UpdateChartInput,
  ): Promise<SavedChartResponse> {
    // Verify chart exists and belongs to this store
    const existing = await db('saved_charts')
      .where({ id: chartId, store_id: storeId })
      .first<SavedChartRecord | undefined>();

    if (!existing) {
      throw new NotFoundError('Saved chart not found');
    }

    const updates: Record<string, unknown> = {
      updated_at: db.fn.now(),
    };

    if (input.title !== undefined) {
      if (typeof input.title !== 'string' || !input.title.trim()) {
        throw new ValidationError('Title cannot be empty');
      }
      if (input.title.length > MAX_TITLE_LENGTH) {
        throw new ValidationError(`Title must not exceed ${MAX_TITLE_LENGTH} characters`);
      }
      updates.title = input.title.trim();
    }

    if (input.chartConfig !== undefined) {
      if (!input.chartConfig || typeof input.chartConfig !== 'object') {
        throw new ValidationError('chartConfig must be an object');
      }
      updates.chart_config = JSON.stringify(input.chartConfig);
    }

    const [updated] = await db('saved_charts')
      .where({ id: chartId, store_id: storeId })
      .update(updates)
      .returning('*');

    const config =
      typeof updated.chart_config === 'string'
        ? JSON.parse(updated.chart_config)
        : updated.chart_config;

    logger.info({ storeId, chartId }, 'Saved chart updated');
    return toResponse({ ...updated, chart_config: config } as SavedChartRecord);
  }

  async function deleteChart(storeId: string, chartId: string): Promise<void> {
    const deleted = await db('saved_charts')
      .where({ id: chartId, store_id: storeId })
      .del();

    if (deleted === 0) {
      throw new NotFoundError('Saved chart not found');
    }

    logger.info({ storeId, chartId }, 'Saved chart deleted');
  }

  async function updateLayout(storeId: string, positions: PositionUpdate[]): Promise<void> {
    if (!Array.isArray(positions) || positions.length === 0) {
      throw new ValidationError('positions must be a non-empty array');
    }

    for (const pos of positions) {
      if (!pos.id || typeof pos.id !== 'string') {
        throw new ValidationError('Each position must have a valid id');
      }
      if (typeof pos.positionIndex !== 'number' || pos.positionIndex < 0) {
        throw new ValidationError('Each position must have a non-negative positionIndex');
      }
    }

    const trx = await db.transaction();
    try {
      for (const pos of positions) {
        const updated = await trx('saved_charts')
          .where({ id: pos.id, store_id: storeId })
          .update({
            position_index: pos.positionIndex,
            updated_at: trx.fn.now(),
          });

        if (updated === 0) {
          throw new NotFoundError(`Chart with id ${pos.id} not found`);
        }
      }
      await trx.commit();

      logger.info({ storeId, count: positions.length }, 'Dashboard layout updated');
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  }

  return {
    saveChart,
    listCharts,
    getChart,
    updateChart,
    deleteChart,
    updateLayout,
  };
}

export type SavedChartsService = ReturnType<typeof createSavedChartsService>;
