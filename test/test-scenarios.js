'use strict';
import { assert } from 'chai';

import Server from '../app/services/server';
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
import { fixMeUp } from './utils/data';
import db from '../app/db';

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

describe('Scenarios', function () {
  before(function (done) {
    dropScenariosFiles()
      .then(() => dropProjectsFiles())
      .then(() => dropScenarios())
      .then(() => dropProjects())
      .then(() => createProjectsTable())
      .then(() => createScenariosTable())
      .then(() => createProjectsFilesTable())
      .then(() => createScenariosFilesTable())
      .then(() => fixMeUp())
      .then(() => done());
  });

  describe('GET /projects/{projId}/scenarios', function () {
    it('should scenarios for project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200/scenarios'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.meta.found, 2);
        assert.equal(result.results[0].name, 'Main scenario 1200');
      });
    });

    it('should return 1 project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200/scenarios?limit=1&page=2'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.meta.found, 2);
        assert.equal(result.results[0].id, 1201);
        assert.equal(result.results[0].name, 'Scenario 1201');
      });
    });
  });

  describe('GET /projects/{projId}/scenarios/{scId}', function () {
    it('should return not found when getting non existent scenario', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/300'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return the correct scenario', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.id, 1000);
        assert.equal(res.result.name, 'Main scenario');
      });
    });
  });

  describe('GET /projects/{projId}/scenarios/0', function () {
    it('should return not found when getting non existent scenario', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/300/scenarios/0'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return the main project scenario', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200/scenarios/0'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.id, 1200);
        assert.equal(res.result.name, 'Main scenario 1200');
      });
    });
  });

  describe('DELETE /projects/{projId}/scenarios/{scId}', function () {
    before(function (done) {
      // Add another scenario to project 1200.
      let id = 9999;
      db
        .insert({
          'id': id,
          'name': `Scenario ${id}`,
          'description': `Ghost scenario ${id} created when the project ${id} was created. Has a poi file`,
          'status': 'active',
          'project_id': 1200,
          'master': false,
          'created_at': '2017-02-01T12:00:00.000Z',
          'updated_at': '2017-02-01T12:00:00.000Z'
        })
        .into('scenarios')
        .then(() => db
          .insert({
            'id': id,
            'name': 'poi_000000',
            'type': 'poi',
            'path': `scenario-${id}/poi_000000`,
            'project_id': 1200,
            'scenario_id': id,
            'created_at': '2017-02-01T12:00:06.000Z',
            'updated_at': '2017-02-01T12:00:06.000Z'
          })
          .into('scenarios_files')
        )
        .then(() => done());
    });

    it('should return not found when deleting non existent project', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1000/scenarios/300'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Scenario not found');
      });
    });

    it('should return not found when deleting non existent scenario', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1000/scenarios/300'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Scenario not found');
      });
    });

    it('should return a conflict when deleting the master scenario', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1000/scenarios/1000'
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        assert.equal(res.result.message, 'The master scenario of a project can not be deleted');
      });
    });

    it('should delete scenario', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1200/scenarios/9999'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.message, 'Scenario deleted');

        return db.select('*')
          .from('scenarios')
          .where('id', 9999)
          .then(scenarios => {
            assert.equal(scenarios.length, 0);
            return;
          })
          .then(() => db.select('*')
            .from('scenarios_files')
            .where('scenario_id', 9999)
            .then(files => {
              assert.equal(files.length, 0);
            })
          );
      });
    });
  });

  describe('PATCH /projects/{projId}/scenarios/{scId}', function () {
    it('should return not found when patching a non existent scenatio', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000/scenarios/300',
        payload: {
        }
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return a conflict when setting a name that already exists for another scenario of the same project', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1200/scenarios/1201',
        payload: {
          name: 'Main scenario 1200'
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Scenario name already in use for this project: Main scenario 1200');
      });
    });

    it('should not accept an empty name', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000/scenarios/1000',
        payload: {
          name: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["name" is not allowed to be empty]/);
      });
    });

    it('should change the scenario name', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000/scenarios/1000',
        payload: {
          name: 'New name'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'New name');
      });
    });

    it('should not accept an empty description', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000/scenarios/1000',
        payload: {
          description: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["description" is not allowed to be empty]/);
      });
    });

    it('should accept a null description', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000/scenarios/1000',
        payload: {
          description: null
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.description, null);
      });
    });

    it('should update all values', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000/scenarios/1000',
        payload: {
          name: 'updated name',
          description: 'updated description'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'updated name');
        assert.equal(result.description, 'updated description');
        assert.equal((new Date(result.created_at)).toISOString(), '2017-02-01T12:00:01.000Z');
        assert.notEqual(result.created_at, result.updated_at);
      });
    });
  });
});
