import type { Knex } from 'knex';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const MAX_SCHEDULES_PER_STORE = 5;
const MAX_NAME_LENGTH = 255;
const VALID_FREQUENCIES = ['daily', 'weekly'] as const;

export interface ScheduledInsightRecord {
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

export interface ScheduledInsightResponse {
  id: string;
  name: string;
  frequency: string;
  hour: number;
  dayOfWeek: number | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduledInsightInput {
  name: string;
  frequency: string;
  hour: number;
  dayOfWeek?: number | null;
  enabled?: boolean;
}

export interface UpdateScheduledInsightInput {
  name?: string;
  frequency?: string;
  hour?: number;
  dayOfWeek?: number | null;
  enabled?: boolean;
}

export interface ScheduledInsightsServiceDeps {
  db: Knex;
}

function toResponse(record: ScheduledInsightRecord): ScheduledInsightResponse {
  return {
    id: record.id,
    name: record.name,
    frequency: record.frequency,
    hour: record.hour,
    dayOfWeek: record.day_of_week,
    enabled: record.enabled,
    lastRunAt: record.last_run_at,
    nextRunAt: record.next_run_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function computeNextRunAt(frequency: string, hour: number, dayOfWeek: number | null, now: Date = new Date()): string {
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(hour);

  if (frequency === 'weekly' && dayOfWeek !== null && dayOfWeek >= 0 && dayOfWeek <= 6) {
    // Find the next occurrence of the specified day of week
    const currentDay = now.getUTCDay();
    let daysUntil = dayOfWeek - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && now >= next)) {
      daysUntil += 7;
    }
    next.setUTCDate(next.getUTCDate() + daysUntil);
  } else {
    // Daily: next occurrence of the specified hour
    if (now >= next) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  }

  return next.toISOString();
}

function validateInput(input: CreateScheduledInsightInput): void {
  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    throw new ValidationError('Name is required');
  }

  if (input.name.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`Name must not exceed ${MAX_NAME_LENGTH} characters`);
  }

  if (!VALID_FREQUENCIES.includes(input.frequency as typeof VALID_FREQUENCIES[number])) {
    throw new ValidationError('Frequency must be "daily" or "weekly"');
  }

  if (typeof input.hour !== 'number' || !Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
    throw new ValidationError('Hour must be an integer between 0 and 23');
  }

  if (input.frequency === 'weekly') {
    if (input.dayOfWeek === undefined || input.dayOfWeek === null) {
      throw new ValidationError('Day of week is required for weekly schedules');
    }
    if (typeof input.dayOfWeek !== 'number' || !Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
      throw new ValidationError('Day of week must be an integer between 0 (Sunday) and 6 (Saturday)');
    }
  }
}

export function createScheduledInsightsService(deps: ScheduledInsightsServiceDeps) {
  const { db } = deps;

  async function createInsight(
    storeId: string,
    input: CreateScheduledInsightInput,
  ): Promise<ScheduledInsightResponse> {
    validateInput(input);

    const dayOfWeek = input.frequency === 'weekly' ? (input.dayOfWeek ?? null) : null;
    const nextRunAt = input.enabled !== false
      ? computeNextRunAt(input.frequency, input.hour, dayOfWeek)
      : null;

    // Use transaction to prevent TOCTOU race on max schedules check
    const inserted = await db.transaction(async (trx) => {
      const countResult = await trx('scheduled_insights')
        .where({ store_id: storeId })
        .count('* as count')
        .first<{ count: string }>();

      const total = parseInt(countResult?.count ?? '0', 10);
      if (total >= MAX_SCHEDULES_PER_STORE) {
        throw new ValidationError(`Maximum of ${MAX_SCHEDULES_PER_STORE} scheduled insights allowed per store`);
      }

      const [row] = await trx('scheduled_insights')
        .insert({
          store_id: storeId,
          name: input.name.trim(),
          frequency: input.frequency,
          hour: input.hour,
          day_of_week: dayOfWeek,
          enabled: input.enabled !== false,
          next_run_at: nextRunAt,
        })
        .returning('*');

      return row;
    });

    logger.info({ storeId, insightId: inserted.id, frequency: input.frequency }, 'Scheduled insight created');
    return toResponse(inserted as ScheduledInsightRecord);
  }

  async function listInsights(storeId: string): Promise<ScheduledInsightResponse[]> {
    const records = await db('scheduled_insights')
      .where({ store_id: storeId })
      .orderBy('created_at', 'desc')
      .select<ScheduledInsightRecord[]>('*');

    return records.map(toResponse);
  }

  async function updateInsight(
    storeId: string,
    insightId: string,
    input: UpdateScheduledInsightInput,
  ): Promise<ScheduledInsightResponse> {
    // Fetch existing record
    const existing = await db('scheduled_insights')
      .where({ id: insightId, store_id: storeId })
      .first<ScheduledInsightRecord | undefined>();

    if (!existing) {
      throw new NotFoundError('Scheduled insight not found');
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const newName = input.name !== undefined ? input.name : existing.name;
    const newFrequency = input.frequency !== undefined ? input.frequency : existing.frequency;
    const newHour = input.hour !== undefined ? input.hour : existing.hour;
    const newEnabled = input.enabled !== undefined ? input.enabled : existing.enabled;
    let newDayOfWeek = input.dayOfWeek !== undefined ? input.dayOfWeek : existing.day_of_week;

    // Validate updated fields
    if (input.name !== undefined) {
      if (!newName || typeof newName !== 'string' || !newName.trim()) {
        throw new ValidationError('Name is required');
      }
      if (newName.length > MAX_NAME_LENGTH) {
        throw new ValidationError(`Name must not exceed ${MAX_NAME_LENGTH} characters`);
      }
      updates.name = newName.trim();
    }

    if (input.frequency !== undefined) {
      if (!VALID_FREQUENCIES.includes(newFrequency as typeof VALID_FREQUENCIES[number])) {
        throw new ValidationError('Frequency must be "daily" or "weekly"');
      }
      updates.frequency = newFrequency;
    }

    if (input.hour !== undefined) {
      if (typeof newHour !== 'number' || !Number.isInteger(newHour) || newHour < 0 || newHour > 23) {
        throw new ValidationError('Hour must be an integer between 0 and 23');
      }
      updates.hour = newHour;
    }

    if (newFrequency === 'weekly') {
      if (newDayOfWeek === undefined || newDayOfWeek === null) {
        throw new ValidationError('Day of week is required for weekly schedules');
      }
      if (typeof newDayOfWeek !== 'number' || !Number.isInteger(newDayOfWeek) || newDayOfWeek < 0 || newDayOfWeek > 6) {
        throw new ValidationError('Day of week must be an integer between 0 (Sunday) and 6 (Saturday)');
      }
      updates.day_of_week = newDayOfWeek;
    } else {
      newDayOfWeek = null;
      updates.day_of_week = null;
    }

    if (input.enabled !== undefined) {
      updates.enabled = newEnabled;
    }

    // Recompute next_run_at
    if (newEnabled) {
      updates.next_run_at = computeNextRunAt(newFrequency, newHour, newDayOfWeek);
    } else {
      updates.next_run_at = null;
    }

    const [updated] = await db('scheduled_insights')
      .where({ id: insightId, store_id: storeId })
      .update(updates)
      .returning('*');

    logger.info({ storeId, insightId }, 'Scheduled insight updated');
    return toResponse(updated as ScheduledInsightRecord);
  }

  async function deleteInsight(storeId: string, insightId: string): Promise<void> {
    const deleted = await db('scheduled_insights')
      .where({ id: insightId, store_id: storeId })
      .del();

    if (deleted === 0) {
      throw new NotFoundError('Scheduled insight not found');
    }

    logger.info({ storeId, insightId }, 'Scheduled insight deleted');
  }

  return {
    createInsight,
    listInsights,
    updateInsight,
    deleteInsight,
  };
}

export type ScheduledInsightsService = ReturnType<typeof createScheduledInsightsService>;
