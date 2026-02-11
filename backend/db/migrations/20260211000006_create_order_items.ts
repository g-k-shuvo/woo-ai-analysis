import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('order_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('order_id')
      .notNullable()
      .references('id')
      .inTable('orders')
      .onDelete('CASCADE');
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.uuid('product_id').references('id').inTable('products');
    table.string('product_name', 500);
    table.string('sku', 100);
    table.integer('quantity').notNullable().defaultTo(1);
    table.decimal('subtotal', 12, 2);
    table.decimal('total', 12, 2);

    table.index(['store_id'], 'idx_order_items_store');
    table.index(['product_id'], 'idx_order_items_product');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_items');
}
