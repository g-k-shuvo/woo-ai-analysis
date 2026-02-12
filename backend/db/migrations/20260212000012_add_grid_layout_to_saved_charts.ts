import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('saved_charts', (table) => {
    table.integer('grid_x').defaultTo(0).notNullable();
    table.integer('grid_y').defaultTo(0).notNullable();
    table.integer('grid_w').defaultTo(6).notNullable();
    table.integer('grid_h').defaultTo(4).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('saved_charts', (table) => {
    table.dropColumn('grid_x');
    table.dropColumn('grid_y');
    table.dropColumn('grid_w');
    table.dropColumn('grid_h');
  });
}
