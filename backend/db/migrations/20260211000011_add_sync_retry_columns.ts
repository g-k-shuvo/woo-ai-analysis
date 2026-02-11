import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sync_logs', (table) => {
    table.integer('retry_count').defaultTo(0).notNullable();
    table.timestamp('next_retry_at', { useTz: true });
    table.index(['store_id', 'status', 'next_retry_at'], 'idx_sync_logs_retry_due');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('sync_logs', (table) => {
    table.dropIndex([], 'idx_sync_logs_retry_due');
    table.dropColumn('retry_count');
    table.dropColumn('next_retry_at');
  });
}
