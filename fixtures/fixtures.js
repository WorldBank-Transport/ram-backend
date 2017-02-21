'use strict';
import db from '../app/services/db';
import { setupStructure } from '../app/db/structure';

//
// Data Insertion

function insertProjects () {
  console.log('Inserting projects');
  return db.batchInsert('projects', [
    {
      id: 1,
      name: 'Project 1',
      description: 'Sample project no 1',
      created_at: (new Date()),
      updated_at: (new Date())
    },
    {
      id: 2,
      name: 'Project 2',
      description: 'Sample project no 2',
      created_at: (new Date()),
      updated_at: (new Date())
    }
  ])
  // Inserting a value for the auto increment column does not move the internal
  // sequence pointer, therefore we need to do it manually.
  .then(() => db.raw('ALTER SEQUENCE projects_id_seq RESTART WITH 3;'));
}

function insertScenarios () {
  console.log('Inserting scenarios');
  return db.batchInsert('scenarios', [
    {
      id: 1,
      name: 'Scenario 1',
      description: 'Sample scenario for project 1',
      project_id: 1,
      created_at: (new Date()),
      updated_at: (new Date())
    },
    {
      id: 2,
      name: 'Scenario 2',
      description: 'Sample scenario for project 1',
      project_id: 1,
      created_at: (new Date()),
      updated_at: (new Date())
    }
  ])
  // Inserting a value for the auto increment column does not move the internal
  // sequence pointer, therefore we need to do it manually.
  .then(() => db.raw('ALTER SEQUENCE scenarios_id_seq RESTART WITH 3;'));
}

function addData () {
  return insertProjects()
    .then(() => insertScenarios());
}

setupStructure()
  .then(() => addData())
  .then(res => {
    console.log('done');
    db.destroy();
  });
