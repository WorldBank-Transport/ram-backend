'use strict';
import db from './';
import config from '../config';

const DEBUG = config.debug;

export function dropProjects () {
  DEBUG && console.log('Dropping table: projects');
  return db.schema.dropTableIfExists('projects');
}

export function dropProjectsFiles () {
  DEBUG && console.log('Dropping table: projects_files');
  return db.schema.dropTableIfExists('projects_files');
}

export function dropProjectsAA () {
  DEBUG && console.log('Dropping table: projects_aa');
  return db.schema.dropTableIfExists('projects_aa');
}

export function dropScenarios () {
  DEBUG && console.log('Dropping table: scenarios');
  return db.schema.dropTableIfExists('scenarios');
}

export function dropScenariosFiles () {
  DEBUG && console.log('Dropping table: scenarios_files');
  return db.schema.dropTableIfExists('scenarios_files');
}

export function dropScenariosSettings () {
  DEBUG && console.log('Dropping table: scenarios_settings');
  return db.schema.dropTableIfExists('scenarios_settings');
}

export function dropOperations () {
  DEBUG && console.log('Dropping table: operations');
  return db.schema.dropTableIfExists('operations');
}

export function dropOperationsLogs () {
  DEBUG && console.log('Dropping table: operations_logs');
  return db.schema.dropTableIfExists('operations_logs');
}

export function dropResults () {
  DEBUG && console.log('Dropping table: results');
  return db.schema.dropTableIfExists('results');
}

export function dropResultsPoi () {
  DEBUG && console.log('Dropping table: results_poi');
  return db.schema.dropTableIfExists('results_poi');
}

export function dropProjectsOrigins () {
  DEBUG && console.log('Dropping table: projects_origins');
  return db.schema.dropTableIfExists('projects_origins');
}

export function dropProjectsOriginsIndicators () {
  DEBUG && console.log('Dropping table: projects_origins_indicators');
  return db.schema.dropTableIfExists('projects_origins_indicators');
}

export function createProjectsTable () {
  DEBUG && console.log('Creating table: projects');
  return db.schema.createTable('projects', table => {
    table.increments('id').primary();
    table.string('name');
    table.text('description');
    table.string('status');
    table.json('bbox');
    table.timestamps();

    table.unique('name');
  });
}

export function createProjectsFilesTable () {
  DEBUG && console.log('Creating table: projects_files');
  return db.schema.createTable('projects_files', table => {
    table.increments('id').primary();
    table.string('name');
    table.string('type');
    table.string('path');
    table.integer('project_id').unsigned();
    table.foreign('project_id')
      .references('projects.id')
      .onDelete('CASCADE');
    table.json('data');
    table.timestamps();
  });
}

export function createProjectsAATable () {
  DEBUG && console.log('Creating table: projects_aa');
  return db.schema.createTable('projects_aa', table => {
    table.increments('id').primary();
    table.string('name');
    table.string('type');
    table.json('geometry');
    table.integer('project_id').unsigned();
    table.foreign('project_id')
      .references('projects.id')
      .onDelete('CASCADE');
  });
}

export function createScenariosTable () {
  DEBUG && console.log('Creating table: scenarios');
  return db.schema.createTable('scenarios', table => {
    table.increments('id').primary();
    table.string('name');
    table.text('description');
    table.string('status');
    table.boolean('master').defaultTo(false);
    table.integer('project_id').unsigned();
    table.foreign('project_id')
      .references('projects.id')
      .onDelete('CASCADE');
    table.json('admin_areas');
    table.timestamps();

    table.unique(['project_id', 'name']);
  });
}

export function createScenariosFilesTable () {
  DEBUG && console.log('Creating table: scenarios_files');
  return db.schema.createTable('scenarios_files', table => {
    table.increments('id').primary();
    table.string('name');
    table.string('type');
    table.string('subtype');
    table.string('path');
    table.integer('project_id').unsigned();
    table.foreign('project_id')
      .references('projects.id')
      .onDelete('CASCADE');
    table.integer('scenario_id').unsigned();
    table.foreign('scenario_id')
      .references('scenarios.id')
      .onDelete('CASCADE');
    table.timestamps();
  });
}

export function createScenariosSettingsTable () {
  DEBUG && console.log('Creating table: scenarios_settings');
  return db.schema.createTable('scenarios_settings', table => {
    table.string('key');
    table.string('value');
    table.integer('scenario_id').unsigned();
    table.foreign('scenario_id')
      .references('scenarios.id')
      .onDelete('CASCADE');
    table.timestamps();
    table.primary(['scenario_id', 'key']);
  });
}

export function createOperationsTable () {
  DEBUG && console.log('Creating table: operations');
  return db.schema.createTable('operations', table => {
    table.increments('id').primary();
    table.string('name');
    table.integer('project_id').unsigned();
    table.foreign('project_id')
      .references('projects.id')
      .onDelete('CASCADE');
    table.integer('scenario_id').unsigned();
    table.foreign('scenario_id')
      .references('scenarios.id')
      .onDelete('CASCADE');
    table.string('status');
    table.timestamps();
  });
}

export function createOperationsLogsTable () {
  DEBUG && console.log('Creating table: operations_logs');
  return db.schema.createTable('operations_logs', table => {
    table.increments('id').primary();
    table.integer('operation_id').unsigned();
    table.foreign('operation_id')
      .references('operations.id')
      .onDelete('CASCADE');
    table.string('code');
    table.json('data');
    table.timestamp('created_at').defaultTo(db.fn.now());
  });
}

export function createResultsTable () {
  DEBUG && console.log('Creating table: results');
  return db.schema.createTable('results', table => {
    table.increments('id').primary();
    table.integer('project_id').unsigned();
    table.foreign('project_id')
      .references('projects.id')
      .onDelete('CASCADE');
    table.integer('scenario_id').unsigned();
    table.foreign('scenario_id')
      .references('scenarios.id')
      .onDelete('CASCADE');
    table.integer('origin_id').unsigned();
    table.foreign('origin_id')
      .references('projects_origins.id')
      .onDelete('CASCADE');
    table.integer('project_aa_id').unsigned();
    table.foreign('project_aa_id')
      .references('projects_aa.id')
      .onDelete('CASCADE');
  });
}

export function createResultsPoiTable () {
  DEBUG && console.log('Creating table: results_poi');
  return db.schema.createTable('results_poi', table => {
    table.increments('id').primary();
    table.integer('result_id').unsigned();
    table.foreign('result_id')
      .references('results.id')
      .onDelete('CASCADE');
    table.string('type');
    table.integer('time');
  });
}

export function createProjectsOriginsTable () {
  DEBUG && console.log('Creating table: projects_origins');
  return db.schema.createTable('projects_origins', table => {
    table.increments('id').primary();
    table.integer('project_id').unsigned();
    table.foreign('project_id')
      .references('projects.id')
      .onDelete('CASCADE');
    table.string('name');
    table.json('coordinates');
  });
}

export function createProjectsOriginsIndicatorsTable () {
  DEBUG && console.log('Creating table: projects_origins_indicators');
  return db.schema.createTable('projects_origins_indicators', table => {
    table.increments('id').primary();
    table.integer('origin_id').unsigned();
    table.foreign('origin_id')
      .references('projects_origins.id')
      .onDelete('CASCADE');
    table.string('key');
    table.string('label');
    table.integer('value');
  });
}

export function setupStructure () {
  return dropScenariosFiles()
  .then(() => dropProjectsFiles())
  .then(() => dropResultsPoi())
  .then(() => dropResults())
  .then(() => dropProjectsAA())
  .then(() => dropOperationsLogs())
  .then(() => dropOperations())
  .then(() => dropScenariosSettings())
  .then(() => dropScenarios())
  .then(() => dropProjectsOriginsIndicators())
  .then(() => dropProjectsOrigins())
  .then(() => dropProjects())
  .then(() => createProjectsTable())
  .then(() => createProjectsAATable())
  .then(() => createScenariosTable())
  .then(() => createScenariosSettingsTable())
  .then(() => createOperationsTable())
  .then(() => createOperationsLogsTable())
  .then(() => createProjectsFilesTable())
  .then(() => createScenariosFilesTable())
  .then(() => createProjectsOriginsTable())
  .then(() => createProjectsOriginsIndicatorsTable())
  .then(() => createResultsTable())
  .then(() => createResultsPoiTable());
}
