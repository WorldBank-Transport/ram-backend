'use strict';
import db from './';

export function dropProjects () {
  console.log('Dropping table: projects');
  return db.schema.dropTableIfExists('projects');
}

export function dropScenarios () {
  console.log('Dropping table: scenarios');
  return db.schema.dropTableIfExists('scenarios');
}

export function createProjectsTable () {
  console.log('Creating table: projects');
  return db.schema.createTable('projects', table => {
    table.increments('id').primary();
    table.string('name');
    table.text('description');
    table.string('status');
    table.timestamps();

    table.unique('name');
  });
}

export function createScenarioTable () {
  console.log('Creating table: scenarios');
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

export function setupStructure () {
  return dropScenarios()
  .then(() => dropProjects())
  .then(() => createProjectsTable())
  .then(() => createScenarioTable());
}
