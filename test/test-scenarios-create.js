'use strict';
import { assert } from 'chai';
import fs from 'fs';
import request from 'request';

import Server from '../app/services/server';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { setupStructure as setupStorageStructure } from '../app/s3/structure';
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
  before('Before - Scenarios', function (done) {
    setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp())
      .then(() => done());
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

    it('should require a value for road-network source', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name'
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /child "roadNetworkSource" fails because \["roadNetworkSource" is required\]/);
      });
    });

    it('should fail with invalid road-network source', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name',
          roadNetworkSource: 'invalid'
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /child "roadNetworkSource" fails because \["roadNetworkSource" must be one of \[clone, new\]\]/);
      });
    });

    it('should require scenario id when road-network source is clone', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name',
          roadNetworkSource: 'clone'
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /child "roadNetworkSourceScenario" fails because \["roadNetworkSourceScenario" is required\]/);
      });
    });

    it('should return not found when creating a scenario for a non existent project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/300/scenarios',
        payload: {
          name: 'Scenario name',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1
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
          name: 'Scenario name',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        assert.equal(res.result.message, 'Project setup not completed');
      });
    });

    it('should return bad request when then scenario to clone from does not exist', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios',
        payload: {
          name: 'New scenario',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.equal(result.message, 'Source scenario for cloning not found');
      });
    });

    it('should return a conflict when using a name that already exists for another scenario of the same project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios',
        payload: {
          name: 'Main scenario 1200',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1200
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Scenario name already in use for this project: Main scenario 1200');
      });
    });

    it('should create a scenario and clone files', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios',
        payload: {
          name: 'New scenario project 1200',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1200
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'New scenario project 1200');
        assert.equal(result.status, 'active');
        assert.equal(result.master, false);
        let adminAreas = [
          {'name': 'Distrito de Abadia', 'selected': false},
          {'name': 'Distrito de Itanhi', 'selected': false},
          {'name': 'Distrito de Conceição de Campinas', 'selected': false},
          {'name': 'Distrito de Sambaíba', 'selected': false},
          {'name': 'Distrito de Buril', 'selected': false},
          {'name': 'Distrito de Itamira', 'selected': false},
          {'name': 'Estância', 'selected': false},
          {'name': 'Itaporanga d\'Ajuda', 'selected': false},
          {'name': 'Salgado', 'selected': false},
          {'name': 'Arauá', 'selected': false},
          {'name': 'Boquim', 'selected': false},
          {'name': 'Cristinápolis', 'selected': false},
          {'name': 'Indiaroba', 'selected': false},
          {'name': 'Itabaianinha', 'selected': false},
          {'name': 'Pedrinhas', 'selected': false},
          {'name': 'Santa Luzia do Itanhy', 'selected': false},
          {'name': 'Tomar do Geru', 'selected': false},
          {'name': 'Umbaúba', 'selected': false},
          {'name': 'Pedra Mole', 'selected': false},
          {'name': 'Campo do Brito', 'selected': false},
          {'name': 'Itabaiana', 'selected': false},
          {'name': 'Lagarto', 'selected': false},
          {'name': 'Macambira', 'selected': false},
          {'name': 'Poço Verde', 'selected': false},
          {'name': 'Simão Dias', 'selected': false},
          {'name': 'São Domingos', 'selected': false},
          {'name': 'Palmares', 'selected': false},
          {'name': 'Riachão do Dantas', 'selected': false},
          {'name': 'Samambaia', 'selected': false},
          {'name': 'Tobias Barreto', 'selected': false}
        ];
        assert.deepEqual(result.admin_areas, adminAreas);
        assert.equal(result.project_id, 1200);
        assert.equal(typeof result.roadNetworkUpload, 'undefined');

        return result;
      })
      .then(result => {
        // Check that files are in the db.
        return Promise.all([
          db.select('*')
          .from('scenarios_files')
          .where('project_id', 1200)
          .where('scenario_id', result.id)
          .then(files => {
            assert.equal(files.length, 2);
            files = files.sort((a, b) => a.type > b.type);

            assert.match(files[0].name, /^poi_[0-9]+$/);
            assert.equal(files[0].type, 'poi');
            assert.match(files[0].path, /scenario-[0-9]+\/poi_[0-9]+/);

            assert.match(files[1].name, /^road-network_[0-9]+$/);
            assert.equal(files[1].type, 'road-network');
            assert.match(files[1].path, /scenario-[0-9]+\/road-network_[0-9]+/);
          }),
          // Ensure that the project "updated_at" gets updated.
          db.select('*')
            .from('projects')
            .where('id', 1200)
            .then(projects => {
              let now = ~~((new Date()).getTime() / 1000);
              let timestamp = ~~((new Date(projects[0].updated_at)).getTime() / 1000);
              assert.approximately(timestamp, now, 1, 'Project updated_at should be updated');
            })
        ]);
      });
    });

    // This tests the full file upload process:
    // - Getting the presigned url.
    // - Uploading the file.
    // - Checking that the database was updated.
    it('should create a scenario and upload new file', function () {
      this.slow(150);
      // Store project and scenario id to simplify matters.
      let projectId = 1200;
      let scenarioId;
      // Create a new scenario. Will return a presigned url for file upload.
      return instance.injectThen({
        method: 'POST',
        url: `/projects/${projectId}/scenarios`,
        payload: {
          name: 'New scenario file upload',
          roadNetworkSource: 'new'
        }
      // Validate scenario properties
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'New scenario file upload');
        assert.equal(result.status, 'active');
        assert.equal(result.master, false);
        let adminAreas = [
          {'name': 'Distrito de Abadia', 'selected': false},
          {'name': 'Distrito de Itanhi', 'selected': false},
          {'name': 'Distrito de Conceição de Campinas', 'selected': false},
          {'name': 'Distrito de Sambaíba', 'selected': false},
          {'name': 'Distrito de Buril', 'selected': false},
          {'name': 'Distrito de Itamira', 'selected': false},
          {'name': 'Estância', 'selected': false},
          {'name': 'Itaporanga d\'Ajuda', 'selected': false},
          {'name': 'Salgado', 'selected': false},
          {'name': 'Arauá', 'selected': false},
          {'name': 'Boquim', 'selected': false},
          {'name': 'Cristinápolis', 'selected': false},
          {'name': 'Indiaroba', 'selected': false},
          {'name': 'Itabaianinha', 'selected': false},
          {'name': 'Pedrinhas', 'selected': false},
          {'name': 'Santa Luzia do Itanhy', 'selected': false},
          {'name': 'Tomar do Geru', 'selected': false},
          {'name': 'Umbaúba', 'selected': false},
          {'name': 'Pedra Mole', 'selected': false},
          {'name': 'Campo do Brito', 'selected': false},
          {'name': 'Itabaiana', 'selected': false},
          {'name': 'Lagarto', 'selected': false},
          {'name': 'Macambira', 'selected': false},
          {'name': 'Poço Verde', 'selected': false},
          {'name': 'Simão Dias', 'selected': false},
          {'name': 'São Domingos', 'selected': false},
          {'name': 'Palmares', 'selected': false},
          {'name': 'Riachão do Dantas', 'selected': false},
          {'name': 'Samambaia', 'selected': false},
          {'name': 'Tobias Barreto', 'selected': false}
        ];
        assert.deepEqual(result.admin_areas, adminAreas);
        assert.equal(result.project_id, projectId);
        assert.notEqual(typeof result.roadNetworkUpload, 'undefined');

        scenarioId = result.id;

        return result;
      })
      // Check that files are in the db.
      .then(result => {
        return Promise.all([
          db.select('*')
          .from('scenarios_files')
          .where('project_id', projectId)
          .where('scenario_id', scenarioId)
          .then(files => {
            assert.equal(files.length, 1, 'Number of scenario files after POST');

            assert.match(files[0].name, /^poi_[0-9]+$/);
            assert.equal(files[0].type, 'poi');
            assert.match(files[0].path, /scenario-[0-9]+\/poi_[0-9]+/);
          }),
          // Ensure that the project "updated_at" gets updated.
          db.select('*')
            .from('projects')
            .where('id', projectId)
            .then(projects => {
              let now = ~~((new Date()).getTime() / 1000);
              let timestamp = ~~((new Date(projects[0].updated_at)).getTime() / 1000);
              assert.approximately(timestamp, now, 1, 'Project updated_at should be updated');
            })
        ])
        .then(() => result.roadNetworkUpload.presignedUrl);
      })
      // Upload file.
      .then(presignedUrl => {
        let reqPromise = new Promise((resolve, reject) => {
          let req = request.put(presignedUrl, (err, resp, body) => {
            if (err) return reject(err);
            return resolve();
          });
          let form = req.form();
          form.append('file', fs.createReadStream('./test/utils/test-file'));
        });

        return reqPromise;
      })

      // Wait...
      // The server is listening for the s3 notification. We have to give it
      // time to resolve...
      // So, try up to 3 times to check that the data is in the db.
      .then(() => {
        return new Promise((resolve, reject) => {
          let tries = 3;
          const retry = (delay, err) => {
            if (--tries === 0) return reject(err);
            setTimeout(() => fn(delay * 2), delay);
          };

          const fn = (delay) => {
            // Ensure all files are in the db.
            Promise.all([
              db.select('*')
                .from('scenarios_files')
                .where('scenario_id', scenarioId)
                .then(files => {
                  assert.equal(files.length, 2);
                  files = files.sort((a, b) => a.type > b.type);

                  assert.match(files[0].name, /^poi_[0-9]+$/);
                  assert.equal(files[0].type, 'poi');
                  assert.match(files[0].path, /scenario-[0-9]+\/poi_[0-9]+/);

                  assert.match(files[1].name, /^road-network_[0-9]+$/);
                  assert.equal(files[1].type, 'road-network');
                  assert.match(files[1].path, /scenario-[0-9]+\/road-network_[0-9]+/);
                }),
              // Ensure that the project "updated_at" gets updated.
              db.select('*')
                .from('projects')
                .where('id', projectId)
                .then(projects => {
                  let now = ~~((new Date()).getTime() / 1000);
                  let timestamp = ~~((new Date(projects[0].updated_at)).getTime() / 1000);
                  assert.approximately(timestamp, now, 1, 'Project updated_at timestamp');
                }),
              // Ensure that the scenario "updated_at" gets updated and status
              // is changed to active.
              db.select('*')
                .from('scenarios')
                .where('id', scenarioId)
                .then(scenarios => {
                  let scenario = scenarios[0];
                  let now = ~~((new Date()).getTime() / 1000);
                  let timestamp = ~~((new Date(scenario.updated_at)).getTime() / 1000);
                  assert.approximately(timestamp, now, 1, 'Scenario updated_at timestamp');
                  assert.equal(scenario.status, 'active', 'Scenario status');
                })
            ])
              .then(() => resolve())
              .catch((err) => retry(delay, err));
          };

          fn(10);
        });
      });
    });
  });
});
