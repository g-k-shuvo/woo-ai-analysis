import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.integer('wc_order_id').notNullable();
    table.timestamp('date_created', { useTz: true }).notNullable();
    table.timestamp('date_modified', { useTz: true });
    table.string('status', 50).notNullable();
    table.decimal('total', 12, 2).notNullable();
    table.decimal('subtotal', 12, 2);
    table.decimal('tax_total', 12, 2);
    table.decimal('shipping_total', 12, 2);
    table.decimal('discount_total', 12, 2);
    table.string('currency', 3).defaultTo('USD');
    table.uuid('customer_id').references('id').inTable('customers');
    table.string('payment_method', 100);
    table.string('coupon_used', 100);
    table.unique(['store_id', 'wc_order_id']);

    table.index(['store_id', 'date_created'], 'idx_orders_store_date');
    table.index(['store_id', 'status'], 'idx_orders_store_status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('orders');
}
