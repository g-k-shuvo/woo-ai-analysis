import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('scheduled_insights', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('frequency', 20).notNullable().defaultTo('daily');
    table.integer('hour').notNullable().defaultTo(8);
    table.integer('day_of_week').nullable();
    table.boolean('enabled').notNullable().defaultTo(true);
    table.timestamp('last_run_at', { useTz: true }).nullable();
    table.timestamp('next_run_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.index(['store_id'], 'idx_scheduled_insights_store');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('scheduled_insights');
}
