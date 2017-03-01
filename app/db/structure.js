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

export function createProjectsTable () {
  DEBUG && console.log('Creating table: projects');
  return db.schema.createTable('projects', table => {
    table.increments('id').primary();
    table.string('name');
    table.text('description');
    table.string('status');
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
    table.integer('project_id').unsigned();
    table.foreign('project_id').references('projects.id');
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
    table.foreign('project_id').references('projects.id');
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
    table.foreign('project_id').references('projects.id');
    table.integer('scenario_id').unsigned();
    table.foreign('scenario_id').references('scenarios.id');
    table.timestamps();
  });
}

export function setupStructure () {
  return dropScenariosFiles()
  .then(() => dropProjectsFiles())
  .then(() => dropScenarios())
  .then(() => dropProjects())
  .then(() => createProjectsTable())
  .then(() => createScenariosTable())
  .then(() => createProjectsFilesTable())
  .then(() => createScenariosFilesTable());
}
