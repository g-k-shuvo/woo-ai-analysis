import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.schema.createTable('stores', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('store_url', 500).notNullable().unique();
    table.string('api_key_hash', 255).notNullable();
    table.string('wc_version', 20);
    table.string('plan', 20).defaultTo('free');
    table.timestamp('connected_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('last_sync_at', { useTz: true });
    table.jsonb('settings').defaultTo('{}');
    table.boolean('is_active').defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('stores');
}
