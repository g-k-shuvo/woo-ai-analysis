import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('categories', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.integer('wc_category_id').notNullable();
    table.string('name', 255).notNullable();
    table.uuid('parent_id').references('id').inTable('categories');
    table.integer('product_count').defaultTo(0);
    table.unique(['store_id', 'wc_category_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('categories');
}
