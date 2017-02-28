'use strict';
import { assert } from 'chai';

import Server from '../app/services/server';
import db from '../app/db';
import {
  dropScenariosFiles,
  dropProjectsFiles,
  dropScenarios,
  dropProjects,
  createProjectsTable,
  createScenariosTable,
  createProjectsFilesTable,
  createScenariosFilesTable
} from '../app/db/structure';

var options = {
  connection: {port: 2000, host: '0.0.0.0'}
};

var instance;
before(function (done) {
  instance = Server(options).hapi;
  instance.register(require('inject-then'), function (err) {
    if (err) throw err;
    done();
  });
});

describe('Scenario files', function () {
  before(function (done) {
    dropScenariosFiles()
      .then(() => dropProjectsFiles())
      .then(() => dropScenarios())
      .then(() => dropProjects())
      .then(() => createProjectsTable())
      .then(() => createScenariosTable())
      .then(() => createProjectsFilesTable())
      .then(() => createScenariosFilesTable())
      .then(() => {
        const projects = [
          {
            id: 1,
            name: 'Project 1',
            description: 'Sample project no 1',
            status: 'pending',
            created_at: (new Date()),
            updated_at: (new Date())
          },
          {
            id: 2,
            name: 'Project 2',
            description: 'Sample project no 2',
            status: 'active',
            created_at: (new Date()),
            updated_at: (new Date())
          }
        ];

        return db.batchInsert('projects', projects)
          // Inserting a value for the auto increment column does not move the internal
          // sequence pointer, therefore we need to do it manually.
          .then(() => db.raw(`ALTER SEQUENCE projects_id_seq RESTART WITH ${projects.length + 1};`));
      })
      .then(() => {
        const scenarios = [
          {
            id: 1,
            name: 'Main scenario',
            description: 'Main scenario for project 1',
            status: 'pending',
            project_id: 1,
            created_at: (new Date()),
            updated_at: (new Date())
          },
          {
            id: 2,
            name: 'Main scenario',
            description: 'Main scenario for project 2',
            status: 'active',
            project_id: 2,
            created_at: (new Date()),
            updated_at: (new Date())
          }
        ];

        return db.batchInsert('scenarios', scenarios)
          // Inserting a value for the auto increment column does not move the internal
          // sequence pointer, therefore we need to do it manually.
          .then(() => db.raw(`ALTER SEQUENCE scenarios_id_seq RESTART WITH ${scenarios.length + 1};`));
      })
      .then(() => done());
  });

  describe('DELETE /projects/{projId}/scenarios/{scId}/files/{fileId}', function () {
    before(function (done) {
      // Insert an entry on every table to ensure delete works.
      // Use just the needed fields.
      db.insert({
        id: 1,
        name: 'road-network_000000',
        type: 'road-network',
        path: 'project-99999/road-network_000000',
        project_id: 1,
        scenario_id: 1
      })
      .into('scenarios_files')
      .then(() => done());
    });

    it('should return 404 for project not found', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/300/scenarios/1/files/1'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Project not found');
      });
    });

    it('should return 404 for scenario not found', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1/scenarios/300/files/1'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Scenario not found');
      });
    });

    it('should return 404 for file not found', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1/scenarios/1/files/300'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'File not found');
      });
    });

    it('should return 400 when project is not pending', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/2/scenarios/2/files/2'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.equal(res.result.message, 'Project no longer in the setup phase. Files can not be removed');
      });
    });

    it('should delete the file', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1/scenarios/1/files/1'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.message, 'File deleted');

        return db.select('*')
          .from('scenarios_files')
          .where('id', 1)
          .then(files => {
            assert.equal(files.length, 0);
          });
      });
    });
  });

  describe('GET /projects/{projId}/scenarios/{scId}/upload', function () {
    before(function (done) {
      db.insert({
        id: 999,
        name: 'Scenario 999',
        description: 'Scenario no 999',
        status: 'pending',
        project_id: 2,
        created_at: (new Date()),
        updated_at: (new Date())
      }).into('scenarios')

      .then(() => db.insert({
        id: 888,
        name: 'road-network_000000',
        type: 'road-network',
        path: 'scenario-999/road-network_000000',
        project_id: 2,
        scenario_id: 999
      }).into('scenarios_files'))

      .then(() => done());
    });

    it('should error when type is not provided', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/300/scenarios/300/upload'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /["type" is required]/);
      });
    });

    it('should error when type is invalid', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/300/scenarios/300/upload?type=invalid'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["type" must be one of \[road-network, poi\]\]/);
      });
    });

    it('should return 404 for project not found', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/300/scenarios/300/upload?type=road-network'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Project not found');
      });
    });

    it('should return 404 for scenario not found', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2/scenarios/300/upload?type=road-network'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Scenario not found');
      });
    });

    it('should return 409 when the file already exists', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2/scenarios/999/upload?type=road-network'
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        assert.equal(res.result.message, 'File already exists');
      });
    });

    it('should return presigned url', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2/scenarios/999/upload?type=poi'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.match(res.result.fileName, /^poi_[0-9]+$/);
        assert.match(res.result.presignedUrl, /scenario-999\/poi_[0-9]+/);
      });
    });
  });
});
