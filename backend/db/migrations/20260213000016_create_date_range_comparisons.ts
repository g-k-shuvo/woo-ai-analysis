import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('date_range_comparisons', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('store_id')
      .notNullable()
      .references('id')
      .inTable('stores')
      .onDelete('CASCADE');
    table.string('preset', 20);
    table.timestamp('current_start', { useTz: true }).notNullable();
    table.timestamp('current_end', { useTz: true }).notNullable();
    table.timestamp('previous_start', { useTz: true }).notNullable();
    table.timestamp('previous_end', { useTz: true }).notNullable();
    table.jsonb('metrics').notNullable().defaultTo('{}');
    table.jsonb('breakdown').notNullable().defaultTo('[]');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    table.index(['store_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('date_range_comparisons');
}
