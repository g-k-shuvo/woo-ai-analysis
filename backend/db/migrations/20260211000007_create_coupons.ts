import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('coupons', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('store_id').notNullable().references('id').inTable('stores').onDelete('CASCADE');
    table.integer('wc_coupon_id').notNullable();
    table.string('code', 100).notNullable();
    table.string('discount_type', 50);
    table.decimal('amount', 12, 2);
    table.integer('usage_count').defaultTo(0);
    table.unique(['store_id', 'wc_coupon_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('coupons');
}
