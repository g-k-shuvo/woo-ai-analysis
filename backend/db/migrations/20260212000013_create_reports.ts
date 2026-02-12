import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reports', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('store_id').notNullable().references('id').inTable('stores');
    table.string('title', 255).notNullable();
    table.string('status', 20).defaultTo('pending').notNullable();
    table.integer('chart_count').defaultTo(0).notNullable();
    table.text('file_data').nullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.index(['store_id'], 'idx_reports_store');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reports');
}
