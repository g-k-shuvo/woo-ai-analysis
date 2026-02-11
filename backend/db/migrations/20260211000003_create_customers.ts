import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('customers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.integer('wc_customer_id').notNullable();
    table.string('email_hash', 64);
    table.string('display_name', 255);
    table.decimal('total_spent', 12, 2).defaultTo(0);
    table.integer('order_count').defaultTo(0);
    table.timestamp('first_order_date', { useTz: true });
    table.timestamp('last_order_date', { useTz: true });
    table.timestamp('created_at', { useTz: true });
    table.unique(['store_id', 'wc_customer_id']);

    table.index(['store_id'], 'idx_customers_store');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('customers');
}
