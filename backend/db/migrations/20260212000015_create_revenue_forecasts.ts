import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('revenue_forecasts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.integer('days_ahead').notNullable();
    table.integer('historical_days').notNullable().defaultTo(90);
    table.jsonb('data_points').notNullable().defaultTo('[]');
    table.jsonb('summary').notNullable().defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.index(['store_id'], 'idx_revenue_forecasts_store');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('revenue_forecasts');
}
