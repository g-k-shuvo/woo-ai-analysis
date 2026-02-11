import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('products', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.integer('wc_product_id').notNullable();
    table.string('name', 500).notNullable();
    table.string('sku', 100);
    table.decimal('price', 12, 2);
    table.decimal('regular_price', 12, 2);
    table.decimal('sale_price', 12, 2);
    table.uuid('category_id').references('id').inTable('categories');
    table.string('category_name', 255);
    table.integer('stock_quantity');
    table.string('stock_status', 50);
    table.string('status', 50).defaultTo('publish');
    table.string('type', 50).defaultTo('simple');
    table.timestamp('created_at', { useTz: true });
    table.timestamp('updated_at', { useTz: true });
    table.unique(['store_id', 'wc_product_id']);

    table.index(['store_id'], 'idx_products_store');
    table.index(['store_id', 'category_id'], 'idx_products_category');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('products');
}
