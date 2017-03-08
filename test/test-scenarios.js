'use strict';
import { assert } from 'chai';
import mockdate from 'mockdate';

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
import { fixMeUp, projectPendingWithFiles } from './utils/data';
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
    it('should return not found when patching a non existent scenario', function () {
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

  describe('Project updated_at property', function () {
    before(function (done) {
      let id = 8888;

      projectPendingWithFiles(8888)
        .then(() => db
          .insert({
            'id': id + 1,
            'name': `Scenario ${id + 1}`,
            'description': `Ghost scenario ${id + 1} created when the project ${id} was created. Has a poi file`,
            'status': 'active',
            'project_id': id,
            'master': false,
            'created_at': '2017-02-01T12:00:00.000Z',
            'updated_at': '2017-02-01T12:00:00.000Z'
          })
          .into('scenarios')
        )
        .then(() => done());
    });

    it('should update when updating a scenario', function () {
      mockdate.set(1000000000000);
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/8888/scenarios/8888',
        payload: {
          name: 'New name'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.name, 'New name');

        return db.select('updated_at')
          .from('projects')
          .where('id', 8888)
          .then(projects => {
            let timestamp = (new Date(projects[0].updated_at)).getTime();
            assert.equal(timestamp, 1000000000000);
            mockdate.reset();
          });
      });
    });

    it('should update when deleting a scenario', function () {
      mockdate.set(1222000000000);
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/8888/scenarios/8889'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');

        return db.select('updated_at')
          .from('projects')
          .where('id', 8888)
          .then(projects => {
            let timestamp = (new Date(projects[0].updated_at)).getTime();
            assert.equal(timestamp, 1222000000000);
            mockdate.reset();
          });
      });
    });

    it('should update when deleting a scenario file', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/8888/scenarios/8888/files/8888'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');

        return db.select('updated_at')
          .from('projects')
          .where('id', 8888)
          .then(projects => {
            // Because of S3 we can't use stub dates.
            // S3Error: The difference between the request time and the server's time is too large.
            let now = ~~((new Date()).getTime() / 1000);
            let timestamp = ~~((new Date(projects[0].updated_at)).getTime() / 1000);
            assert.equal(timestamp, now);
          });
      });
    });
  });

  describe('POST /projects/{projId}/scenarios', function () {
    it('should fail when creating a scenario without a name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["name" is required]/);
      });
    });

    it('should not accept an empty name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["name" is not allowed to be empty]/);
      });
    });

    it('should not accept an empty description', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name',
          description: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["description" is not allowed to be empty]/);
      });
    });

    it('should return not found when creating a scenario for a non existent project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/300/scenarios',
        payload: {
          name: 'Scenario name'
        }
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Project not found');
      });
    });

    it('should return conflict for a non set up project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name'
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        assert.equal(res.result.message, 'Project setup not completed');
      });
    });

    it('should return a conflict when using a name that already exists for another scenario of the same project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios',
        payload: {
          name: 'Main scenario 1200'
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Scenario name already in use for this project: Main scenario 1200');
      });
    });

    it('should return bad request when then scenario to clone from does not exist', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios',
        payload: {
          name: 'New scenario',
          roadNetworkSourceScenario: 1
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.equal(result.message, 'Source scenario for cloning not found');
      });
    });
  });
});
