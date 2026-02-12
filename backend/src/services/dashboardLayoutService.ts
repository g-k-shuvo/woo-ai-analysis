import type { Knex } from 'knex';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const MIN_GRID_W = 3;
const MAX_GRID_W = 12;
const MIN_GRID_H = 2;
const MAX_GRID_H = 8;
const GRID_COLUMNS = 12;

export interface GridLayoutItem {
  id: string;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
}

export interface DashboardLayoutServiceDeps {
  db: Knex;
}

export function createDashboardLayoutService(deps: DashboardLayoutServiceDeps) {
  const { db } = deps;

  async function updateGridLayout(storeId: string, items: GridLayoutItem[]): Promise<void> {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('items must be a non-empty array');
    }

    for (const item of items) {
      if (!item.id || typeof item.id !== 'string') {
        throw new ValidationError('Each item must have a valid id');
      }
      if (typeof item.gridX !== 'number' || item.gridX < 0) {
        throw new ValidationError('gridX must be a non-negative number');
      }
      if (typeof item.gridY !== 'number' || item.gridY < 0) {
        throw new ValidationError('gridY must be a non-negative number');
      }
      if (typeof item.gridW !== 'number' || item.gridW < MIN_GRID_W || item.gridW > MAX_GRID_W) {
        throw new ValidationError(`gridW must be between ${MIN_GRID_W} and ${MAX_GRID_W}`);
      }
      if (typeof item.gridH !== 'number' || item.gridH < MIN_GRID_H || item.gridH > MAX_GRID_H) {
        throw new ValidationError(`gridH must be between ${MIN_GRID_H} and ${MAX_GRID_H}`);
      }
      if (item.gridX + item.gridW > GRID_COLUMNS) {
        throw new ValidationError(`Item exceeds grid width: gridX(${item.gridX}) + gridW(${item.gridW}) > ${GRID_COLUMNS}`);
      }
    }

    const trx = await db.transaction();
    try {
      for (const item of items) {
        const updated = await trx('saved_charts')
          .where({ id: item.id, store_id: storeId })
          .update({
            grid_x: item.gridX,
            grid_y: item.gridY,
            grid_w: item.gridW,
            grid_h: item.gridH,
            updated_at: trx.fn.now(),
          });

        if (updated === 0) {
          throw new NotFoundError(`Chart with id ${item.id} not found`);
        }
      }
      await trx.commit();

      logger.info({ storeId, count: items.length }, 'Dashboard grid layout updated');
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  }

  return {
    updateGridLayout,
  };
}

export type DashboardLayoutService = ReturnType<typeof createDashboardLayoutService>;
