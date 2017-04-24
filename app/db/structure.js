'use strict';
import db from './';
import config from '../config';

const DEBUG = config.debug;

export function dropProjects () {
  DEBUG && console.log('Dropping table: projects');
  return db.schema.dropTableIfExists('projects');
}

export function dropScenarios () {
  DEBUG && console.log('Dropping table: scenarios');
  return db.schema.dropTableIfExists('scenarios');
}

export function dropProjectsFiles () {
  DEBUG && console.log('Dropping table: projects_files');
  return db.schema.dropTableIfExists('projects_files');
}

export function dropScenariosFiles () {
  DEBUG && console.log('Dropping table: scenarios_files');
  return db.schema.dropTableIfExists('scenarios_files');
}

export function dropOperations () {
  DEBUG && console.log('Dropping table: operations');
  return db.schema.dropTableIfExists('operations');
}

export function dropOperationsLogs () {
  DEBUG && console.log('Dropping table: operations_logs');
  return db.schema.dropTableIfExists('operations_logs');
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
    // Arbitrary additional json data.
    table.json('data');
    table.timestamps();

    table.unique(['project_id', 'name']);
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
    // Arbitrary additional json data.
    table.json('data');
    table.timestamps();
  });
}

export function createScenariosFilesTable () {
  DEBUG && console.log('Creating table: scenarios_files');
  return db.schema.createTable('scenarios_files', table => {
    table.increments('id').primary();
    table.string('name');
    table.string('type');
    table.string('path');
    table.integer('project_id').unsigned();
    table.foreign('project_id')
      .references('projects.id')
      .onDelete('CASCADE');
    table.integer('scenario_id').unsigned();
    table.foreign('scenario_id')
      .references('scenarios.id')
      .onDelete('CASCADE');
    // Arbitrary additional json data.
    table.json('data');
    table.timestamps();
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

export function setupStructure () {
  return dropScenariosFiles()
  .then(() => dropProjectsFiles())
  .then(() => dropOperationsLogs())
  .then(() => dropOperations())
  .then(() => dropScenarios())
  .then(() => dropProjects())
  .then(() => createProjectsTable())
  .then(() => createScenariosTable())
  .then(() => createOperationsTable())
  .then(() => createOperationsLogsTable())
  .then(() => createProjectsFilesTable())
  .then(() => createScenariosFilesTable());
}
