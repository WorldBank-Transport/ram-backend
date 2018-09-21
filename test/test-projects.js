'use strict';
import { assert } from 'chai';

import initServer from '../app/services/server';
import db from '../app/db';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { setupStructure as setupStorageStructure } from '../app/s3/structure';
import {
  fixMeUp,
  projectPendingWithFiles,
  projectPendingWithAllFiles,
  projectPendingWithAllFilesAndOperation } from './utils/data';

var options = {
  connection: {port: 2000, host: '0.0.0.0'}
};

var instance;
before(function (done) {
  initServer(options, function (_, server) {
    instance = server.hapi;
    instance.register(require('inject-then'), function (err) {
      if (err) throw err;

      done();
    });
  });
});

describe('Projects', function () {
  before('Before - Projects', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('GET /projects', function () {
    it('should return projects', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.meta.found, 8);
        assert.equal(result.results[0].name, 'Project 1000');
      });
    });

    it('should return 1 project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects?limit=1&page=2'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.meta.found, 8);
        assert.equal(result.results[0].id, 1002);
        assert.equal(result.results[0].status, 'pending');
        assert.equal(result.results[0].name, 'Project 1002');
      });
    });

    it('should include the scenario count for a project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.results[0].id, 1000);
        assert.equal(res.result.results[0].scenarioCount, 1);
      });
    });

    it('should not include readyToEndSetup flag', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(typeof res.result.results[0].readyToEndSetup, 'undefined');
      });
    });
  });

  describe('GET /projects/{projId}', function () {
    it('should return not found when getting non existent project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/300'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return the correct project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.id, 1000);
        assert.equal(res.result.name, 'Project 1000');
      });
    });

    it('should have the correct source data with no files', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        let project = res.result;
        assert.deepEqual(project.sourceData, {
          profile: {
            type: null,
            files: [],
            wbCatalogOptions: []
          },
          'admin-bounds': {
            type: null,
            files: [],
            wbCatalogOptions: []
          },
          origins: {
            type: null,
            files: [],
            wbCatalogOptions: []
          }
        });
      });
    });

    it('should have the correct source data with all files', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        let project = res.result;
        assert.deepEqual(project.sourceData, {
          profile: {
            type: 'default',
            files: [
              {
                'id': 2000,
                'name': 'profile_000000',
                'type': 'profile',
                'path': 'project-2000/profile_000000',
                'data': null,
                'created_at': new Date('2017-02-01T12:00:06.000Z')
              }
            ],
            wbCatalogOptions: []
          },
          'admin-bounds': {
            type: 'file',
            files: [
              {
                'id': 2002,
                'name': 'admin-bounds_000000',
                'type': 'admin-bounds',
                'path': 'project-2000/admin-bounds_000000',
                'data': null,
                'created_at': new Date('2017-02-01T12:00:06.000Z')
              }
            ],
            wbCatalogOptions: []
          },
          origins: {
            type: 'file',
            files: [
              {
                'id': 2001,
                'name': 'origins_000000',
                'type': 'origins',
                'path': 'project-2000/origins_000000',
                'data': {
                  'availableInd': ['population'],
                  'indicators': [ { 'key': 'population', 'label': 'Total population' } ]
                },
                'created_at': new Date('2017-02-01T12:00:06.000Z')
              }
            ],
            wbCatalogOptions: []
          }
        });
      });
    });

    it('should include the scenario count for an individual project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.id, 1200);
        assert.equal(res.result.scenarioCount, 2);
      });
    });

    it('should include readyToEndSetup flag with false', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.readyToEndSetup, false);
      });
    });

    it('should include readyToEndSetup flag with true', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1004'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.readyToEndSetup, true);
      });
    });

    it('should include readyToEndSetup flag with true even for active project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.status, 'active');
        assert.equal(res.result.readyToEndSetup, true);
      });
    });

    it('should not include bbox for a pending project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1004'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.status, 'pending');
        assert.equal(res.result.bbox, null);
      });
    });

    it('should include bbox for a pending project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.status, 'active');
        assert.deepEqual(res.result.bbox, [ -38.313, -11.89, -37.1525399, -10.5333431 ]);
      });
    });
  });

  describe('DELETE /projects/{projId}', function () {
    before(function (done) {
      // Insert an entry on every table to ensure delete works.
      // Use just the needed fields.
      projectPendingWithFiles(99999)
      .then(() => projectPendingWithAllFilesAndOperation(88888))
      .then(() => done());
    });

    it('should return not found when deleting non existent project', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/10'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should delete a project pending and all related scenarios and files', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/99999'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.message, 'Project deleted');

        return db.select('*')
          .from('scenarios')
          .where('project_id', 99999)
          .then(scenarios => {
            assert.equal(scenarios.length, 0);
            return;
          })
          .then(() => db.select('*')
            .from('projects_files')
            .where('project_id', 99999)
            .then(files => {
              assert.equal(files.length, 0);
            })
          )
          .then(() => db.select('*')
            .from('scenarios_files')
            .where('project_id', 99999)
            .then(files => {
              assert.equal(files.length, 0);
            })
          );
      });
    });

    it('should delete a project pending and all related scenarios, files and operation', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/88888'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.message, 'Project deleted');

        return db.select('*')
          .from('scenarios')
          .where('project_id', 88888)
          .then(scenarios => {
            assert.equal(scenarios.length, 0);
            return;
          })
          .then(() => db.select('*')
            .from('projects_files')
            .where('project_id', 88888)
            .then(files => {
              assert.equal(files.length, 0);
            })
          )
          .then(() => db.select('*')
            .from('scenarios_files')
            .where('project_id', 88888)
            .then(files => {
              assert.equal(files.length, 0);
            })
          )
          .then(() => db.select('*')
            .from('operations')
            .where('project_id', 88888)
            .then(op => {
              assert.equal(op.length, 0);
            })
          );
      });
    });
  });

  describe('POST /projects', function () {
    it('should fail when creating a project without a name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /['name' is required]/);
      });
    });

    it('should create a project with just the name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Project created'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'Project created');
        assert.equal(result.status, 'pending');
        assert.equal(result.description, null);
      });
    });

    it('should return a conflict when creating a project with the same name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Project created'
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Project name already in use: Project created');
      });
    });

    it('should create a project with all properties', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Project with all properties',
          description: 'This is the description'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'Project with all properties');
        assert.equal(result.description, 'This is the description');
      });
    });

    it('should create a master ghost scenario', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Project and ghost'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'Project and ghost');

        return db('scenarios')
          .select('*')
          .where('project_id', result.id)
          .where('master', true)
          .first()
          .then(scenario => db.select('key', 'value')
            .from('scenarios_settings')
            .where('scenario_id', scenario.id)
            .then(data => {
              scenario.data = {};
              data.forEach(o => {
                scenario.data[o.key] = o.value;
              });
              return scenario;
            })
          )
          .then(scenario => {
            assert.equal(scenario.name, 'Main scenario');
            assert.equal(scenario.data.res_gen_at, 0);
            assert.equal(scenario.data.rn_updated_at, 0);
          });
      });
    });
  });

  describe('PATCH /projects/{projId}', function () {
    it('should return not found when patching a non existent project', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/10',
        payload: {
        }
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return a conflict when setting a name that already exists', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000',
        payload: {
          name: 'Project 1100'
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Project name already in use: Project 1100');
      });
    });

    it('should not accept an empty name', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000',
        payload: {
          name: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /['name' is not allowed to be empty]/);
      });
    });

    it('should change the project name', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000',
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
        url: '/projects/1000',
        payload: {
          description: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /['description' is not allowed to be empty]/);
      });
    });

    it('should accept a null description', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/1000',
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
        url: '/projects/1000',
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

  describe('POST /projects/{projId}/finish-setup', function () {
    before(function (done) {
      this.timeout(5000);
      // Needed for test: 'should update project and scenario with name and description'
      projectPendingWithAllFiles(19999)
        .then(() => done());
    });

    it('should return a conflict when finishing setup for an active project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/finish-setup',
        payload: {
          scenarioName: 'Main scenario'
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Project setup already completed');
      });
    });

    it('should return a conflict when finishing setup for a project not ready', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/finish-setup',
        payload: {
          scenarioName: 'Main scenario'
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Project preconditions to finish setup not met');
      });
    });

    it('should return 404 when finishing setup for a non existent project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/300/finish-setup',
        payload: {
          scenarioName: 'Main scenario'
        }
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        var result = res.result;
        assert.equal(result.message, 'Project not found');
      });
    });

    it('should update project and scenario with name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1004/finish-setup',
        payload: {
          scenarioName: 'Main scenario'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.message, 'Project setup finish started');

        // Check the db for updates.
        return Promise.all([
          db('projects')
            .where('id', 1004)
            .first()
            .then(proj => {
              assert.equal(proj.status, 'pending');
            }),
          db('scenarios')
            .where('project_id', 1004)
            .first()
            .then(scenario => {
              assert.equal(scenario.status, 'pending');
              assert.equal(scenario.name, 'Main scenario');
            }),
          db('operations')
            .where('project_id', 1004)
            .where('name', 'project-setup-finish')
            .first()
            .then(operation => {
              assert.equal(operation.status, 'running');
              return db('operations_logs')
                .where('operation_id', operation.id)
                .first()
                .then(log => {
                  assert.equal(log.code, 'start');
                });
            })
        ]);
      });
    });

    it('should update project and scenario with name and description', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/19999/finish-setup',
        payload: {
          scenarioName: 'Main scenario updated',
          scenarioDescription: 'Main scenario description'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.message, 'Project setup finish started');

        // Check the db for updates.
        return Promise.all([
          db('projects')
            .where('id', 19999)
            .then(proj => {
              assert.equal(proj[0].status, 'pending');
            }),
          db('scenarios')
            .where('project_id', 19999)
            .then(scenario => {
              assert.equal(scenario[0].status, 'pending');
              assert.equal(scenario[0].name, 'Main scenario updated');
              assert.equal(scenario[0].description, 'Main scenario description');
            })
        ]);
      });
    });
  });

  describe('other', function () {
    it('should create a pending scenario in the database', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'A new project'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');

        return db.select('*')
          .from('scenarios')
          .where('project_id', res.result.id)
          .then(scenarios => {
            assert.equal(scenarios.length, 1);
            assert.equal(scenarios[0].status, 'pending');
          });
      });
    });
  });
});
