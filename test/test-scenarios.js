'use strict';
import { assert } from 'chai';
import mockdate from 'mockdate';

import initServer from '../app/services/server';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { setupStructure as setupStorageStructure } from '../app/s3/structure';
import { fixMeUp, projectPendingWithFiles } from './utils/data';
import db from '../app/db';

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

describe('Scenarios', function () {
  before('Before - Scenarios', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
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
        let scenario = result.results[0];
        assert.equal(scenario.name, 'Main scenario 1200');
        assert.equal(scenario.description, 'Scenario 1200 created when the project 1200 was created');
        assert.equal(scenario.status, 'active');
        assert.equal(scenario.master, true);
        assert.deepEqual(scenario.data, { res_gen_at: '0', rn_updated_at: '0' });
        assert.equal(scenario.gen_analysis, null);
        assert.equal(scenario.scen_create, null);
      });
    });

    it('should return 1 scenario', function () {
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
        let scenario = res.result;
        assert.equal(scenario.id, 1000);
        assert.equal(scenario.name, 'Main scenario');
        assert.equal(scenario.description, 'Ghost scenario created when the project was created');
        assert.equal(scenario.status, 'pending');
        assert.equal(scenario.master, true);
        assert.equal(scenario.admin_areas, null);
        assert.deepEqual(scenario.data, { res_gen_at: '0', rn_updated_at: '0' });
        assert.equal(scenario.gen_analysis, null);
        assert.equal(scenario.scen_create, null);
      });
    });

    it('should return the correct scenario - active', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        let scenario = res.result;
        assert.equal(scenario.id, 2000);
        assert.equal(scenario.name, 'Main scenario for Sergipe');
        assert.equal(scenario.description, '');
        assert.equal(scenario.status, 'active');
        assert.equal(scenario.master, true);
        assert.deepEqual(scenario.admin_areas, [
          { 'id': 200001, 'name': 'Arauá', 'type': 'boundary', 'selected': false },
          { 'id': 200002, 'name': 'Boquim', 'type': 'boundary', 'selected': false },
          { 'id': 200003, 'name': 'Campo do Brito', 'type': 'boundary', 'selected': false },
          { 'id': 200004, 'name': 'Cristinápolis', 'type': 'boundary', 'selected': false },
          { 'id': 200005, 'name': 'Distrito de Abadia', 'type': 'boundary', 'selected': false },
          { 'id': 200006, 'name': 'Distrito de Buril', 'type': 'boundary', 'selected': false },
          { 'id': 200007, 'name': 'Distrito de Conceição de Campinas', 'type': 'boundary', 'selected': false },
          { 'id': 200008, 'name': 'Distrito de Itamira', 'type': 'boundary', 'selected': false },
          { 'id': 200009, 'name': 'Distrito de Itanhi', 'type': 'boundary', 'selected': false },
          { 'id': 2000010, 'name': 'Distrito de Sambaíba', 'type': 'boundary', 'selected': false },
          { 'id': 2000011, 'name': 'Estância', 'type': 'boundary', 'selected': false },
          { 'id': 2000012, 'name': 'Indiaroba', 'type': 'boundary', 'selected': false },
          { 'id': 2000013, 'name': 'Itabaiana', 'type': 'boundary', 'selected': true },
          { 'id': 2000014, 'name': 'Itabaianinha', 'type': 'boundary', 'selected': false },
          { 'id': 2000015, 'name': 'Itaporanga d\'Ajuda', 'type': 'boundary', 'selected': false },
          { 'id': 2000016, 'name': 'Lagarto', 'type': 'boundary', 'selected': true },
          { 'id': 2000017, 'name': 'Macambira', 'type': 'boundary', 'selected': false },
          { 'id': 2000018, 'name': 'Palmares', 'type': 'boundary', 'selected': false },
          { 'id': 2000019, 'name': 'Pedra Mole', 'type': 'boundary', 'selected': false },
          { 'id': 2000020, 'name': 'Pedrinhas', 'type': 'boundary', 'selected': false },
          { 'id': 2000021, 'name': 'Poço Verde', 'type': 'boundary', 'selected': true },
          { 'id': 2000022, 'name': 'Riachão do Dantas', 'type': 'boundary', 'selected': false },
          { 'id': 2000023, 'name': 'Salgado', 'type': 'boundary', 'selected': true },
          { 'id': 2000024, 'name': 'Samambaia', 'type': 'boundary', 'selected': false },
          { 'id': 2000025, 'name': 'Santa Luzia do Itanhy', 'type': 'boundary', 'selected': false },
          { 'id': 2000026, 'name': 'São Domingos', 'type': 'boundary', 'selected': false },
          { 'id': 2000027, 'name': 'Simão Dias', 'type': 'boundary', 'selected': false },
          { 'id': 2000028, 'name': 'Tobias Barreto', 'type': 'boundary', 'selected': false },
          { 'id': 2000029, 'name': 'Tomar do Geru', 'type': 'boundary', 'selected': false },
          { 'id': 2000030, 'name': 'Umbaúba', 'type': 'boundary', 'selected': false }
        ]);
        assert.deepEqual(scenario.data, { res_gen_at: '0', rn_updated_at: '0' });
        assert.equal(scenario.gen_analysis, null);
        assert.equal(scenario.scen_create, null);
      });
    });

    it('should have the correct source data with no files', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        let scenario = res.result;
        assert.deepEqual(scenario.sourceData, {
          'road-network': {
            type: null,
            files: [],
            osmOptions: {}
          },
          poi: {
            type: null,
            files: [],
            osmOptions: {}
          }
        });
      });
    });

    it('should have the correct source data with all files', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        let scenario = res.result;
        assert.deepEqual(scenario.sourceData, {
          'road-network': {
            type: 'file',
            files: [
              {
                'id': 2000,
                'name': 'road-network_000000',
                'type': 'road-network',
                'subtype': null,
                'path': 'scenario-2000/road-network_000000',
                'created_at': new Date('2017-02-01T12:00:06.000Z')
              }
            ],
            osmOptions: {}
          },
          poi: {
            type: 'file',
            files: [
              {
                'id': 2001,
                'name': 'poi_000000',
                'type': 'poi',
                'subtype': 'pointOfInterest',
                'path': 'scenario-2000/poi_000000',
                'created_at': new Date('2017-02-01T12:00:06.000Z')
              }
            ],
            osmOptions: {}
          }
        });
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
        var scenario = res.result;
        assert.equal(scenario.name, 'updated name');
        assert.equal(scenario.description, 'updated description');
        assert.equal(scenario.status, 'pending');
        assert.equal(scenario.master, true);
        assert.isTrue(typeof scenario.sourceData !== undefined);
        assert.deepEqual(scenario.data, { res_gen_at: '0', rn_updated_at: '0' });
        assert.equal(scenario.gen_analysis, null);
        assert.equal(scenario.scen_create, null);
        assert.equal((new Date(scenario.created_at)).toISOString(), '2017-02-01T12:00:01.000Z');
        assert.notEqual(scenario.created_at, scenario.updated_at);
      });
    });

    it('should update the selected admin areas', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/2000/scenarios/2000',
        payload: {
          selectedAdminAreas: [200001, 200002, 200003, 200004]
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        let adminAreas = [
          { 'id': 200001, 'name': 'Arauá', 'type': 'boundary', 'selected': true },
          { 'id': 200002, 'name': 'Boquim', 'type': 'boundary', 'selected': true },
          { 'id': 200003, 'name': 'Campo do Brito', 'type': 'boundary', 'selected': true },
          { 'id': 200004, 'name': 'Cristinápolis', 'type': 'boundary', 'selected': true },
          { 'id': 200005, 'name': 'Distrito de Abadia', 'type': 'boundary', 'selected': false },
          { 'id': 200006, 'name': 'Distrito de Buril', 'type': 'boundary', 'selected': false },
          { 'id': 200007, 'name': 'Distrito de Conceição de Campinas', 'type': 'boundary', 'selected': false },
          { 'id': 200008, 'name': 'Distrito de Itamira', 'type': 'boundary', 'selected': false },
          { 'id': 200009, 'name': 'Distrito de Itanhi', 'type': 'boundary', 'selected': false },
          { 'id': 2000010, 'name': 'Distrito de Sambaíba', 'type': 'boundary', 'selected': false },
          { 'id': 2000011, 'name': 'Estância', 'type': 'boundary', 'selected': false },
          { 'id': 2000012, 'name': 'Indiaroba', 'type': 'boundary', 'selected': false },
          { 'id': 2000013, 'name': 'Itabaiana', 'type': 'boundary', 'selected': false },
          { 'id': 2000014, 'name': 'Itabaianinha', 'type': 'boundary', 'selected': false },
          { 'id': 2000015, 'name': 'Itaporanga d\'Ajuda', 'type': 'boundary', 'selected': false },
          { 'id': 2000016, 'name': 'Lagarto', 'type': 'boundary', 'selected': false },
          { 'id': 2000017, 'name': 'Macambira', 'type': 'boundary', 'selected': false },
          { 'id': 2000018, 'name': 'Palmares', 'type': 'boundary', 'selected': false },
          { 'id': 2000019, 'name': 'Pedra Mole', 'type': 'boundary', 'selected': false },
          { 'id': 2000020, 'name': 'Pedrinhas', 'type': 'boundary', 'selected': false },
          { 'id': 2000021, 'name': 'Poço Verde', 'type': 'boundary', 'selected': false },
          { 'id': 2000022, 'name': 'Riachão do Dantas', 'type': 'boundary', 'selected': false },
          { 'id': 2000023, 'name': 'Salgado', 'type': 'boundary', 'selected': false },
          { 'id': 2000024, 'name': 'Samambaia', 'type': 'boundary', 'selected': false },
          { 'id': 2000025, 'name': 'Santa Luzia do Itanhy', 'type': 'boundary', 'selected': false },
          { 'id': 2000026, 'name': 'São Domingos', 'type': 'boundary', 'selected': false },
          { 'id': 2000027, 'name': 'Simão Dias', 'type': 'boundary', 'selected': false },
          { 'id': 2000028, 'name': 'Tobias Barreto', 'type': 'boundary', 'selected': false },
          { 'id': 2000029, 'name': 'Tomar do Geru', 'type': 'boundary', 'selected': false },
          { 'id': 2000030, 'name': 'Umbaúba', 'type': 'boundary', 'selected': false }
        ];
        assert.deepEqual(result.admin_areas, adminAreas);
      });
    });

    it('should deselect all admin areas', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/2000/scenarios/2000',
        payload: {
          selectedAdminAreas: []
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        let adminAreas = [
          { 'id': 200001, 'name': 'Arauá', 'type': 'boundary', 'selected': false },
          { 'id': 200002, 'name': 'Boquim', 'type': 'boundary', 'selected': false },
          { 'id': 200003, 'name': 'Campo do Brito', 'type': 'boundary', 'selected': false },
          { 'id': 200004, 'name': 'Cristinápolis', 'type': 'boundary', 'selected': false },
          { 'id': 200005, 'name': 'Distrito de Abadia', 'type': 'boundary', 'selected': false },
          { 'id': 200006, 'name': 'Distrito de Buril', 'type': 'boundary', 'selected': false },
          { 'id': 200007, 'name': 'Distrito de Conceição de Campinas', 'type': 'boundary', 'selected': false },
          { 'id': 200008, 'name': 'Distrito de Itamira', 'type': 'boundary', 'selected': false },
          { 'id': 200009, 'name': 'Distrito de Itanhi', 'type': 'boundary', 'selected': false },
          { 'id': 2000010, 'name': 'Distrito de Sambaíba', 'type': 'boundary', 'selected': false },
          { 'id': 2000011, 'name': 'Estância', 'type': 'boundary', 'selected': false },
          { 'id': 2000012, 'name': 'Indiaroba', 'type': 'boundary', 'selected': false },
          { 'id': 2000013, 'name': 'Itabaiana', 'type': 'boundary', 'selected': false },
          { 'id': 2000014, 'name': 'Itabaianinha', 'type': 'boundary', 'selected': false },
          { 'id': 2000015, 'name': 'Itaporanga d\'Ajuda', 'type': 'boundary', 'selected': false },
          { 'id': 2000016, 'name': 'Lagarto', 'type': 'boundary', 'selected': false },
          { 'id': 2000017, 'name': 'Macambira', 'type': 'boundary', 'selected': false },
          { 'id': 2000018, 'name': 'Palmares', 'type': 'boundary', 'selected': false },
          { 'id': 2000019, 'name': 'Pedra Mole', 'type': 'boundary', 'selected': false },
          { 'id': 2000020, 'name': 'Pedrinhas', 'type': 'boundary', 'selected': false },
          { 'id': 2000021, 'name': 'Poço Verde', 'type': 'boundary', 'selected': false },
          { 'id': 2000022, 'name': 'Riachão do Dantas', 'type': 'boundary', 'selected': false },
          { 'id': 2000023, 'name': 'Salgado', 'type': 'boundary', 'selected': false },
          { 'id': 2000024, 'name': 'Samambaia', 'type': 'boundary', 'selected': false },
          { 'id': 2000025, 'name': 'Santa Luzia do Itanhy', 'type': 'boundary', 'selected': false },
          { 'id': 2000026, 'name': 'São Domingos', 'type': 'boundary', 'selected': false },
          { 'id': 2000027, 'name': 'Simão Dias', 'type': 'boundary', 'selected': false },
          { 'id': 2000028, 'name': 'Tobias Barreto', 'type': 'boundary', 'selected': false },
          { 'id': 2000029, 'name': 'Tomar do Geru', 'type': 'boundary', 'selected': false },
          { 'id': 2000030, 'name': 'Umbaúba', 'type': 'boundary', 'selected': false }
        ];
        assert.deepEqual(result.admin_areas, adminAreas);
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
            assert.approximately(timestamp, now, 1);
          });
      });
    });
  });

  describe('GET /projects/{projId}/scenarios/{scId}/results?download=true', function () {
    before(function (done) {
      // Add one file without an s3 representation.
      db.insert({
        id: 10000001,
        name: 'results_000000',
        type: 'results-csv',
        path: 'scenario-1000/results_000000',
        project_id: 1000,
        scenario_id: 1000
      })
      .into('scenarios_files')
      .then(() => done());
    });

    after(function (done) {
      // cleanup
      db('scenarios_files')
        .where('id', 10000001)
        .del()
      .then(() => done());
    });

    it('should return 400 when download is missing', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000/results?type=csv'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.equal(res.result.message, 'child "download" fails because ["download" is required]');
      });
    });

    it('should return 400 when type is missing', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000/results?download=true'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.equal(res.result.message, 'child "type" fails because ["type" is required]');
      });
    });

    it('should return 400 when download flag not true', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000/results?download=false&type=geojson'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.equal(res.result.message, 'child "download" fails because ["download" must be one of [true]]');
      });
    });

    it('should return 400 when type is incorrect', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000/results?download=true&type=csvjson '
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.equal(res.result.message, 'child "type" fails because ["type" must be one of [csv, geojson]]');
      });
    });

    it('should return 404 when a file is not found', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/8888/scenarios/8888/results?download=true&type=csv'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Results not found');
      });
    });

    it('should return 404 when a file is not found on s3', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000/results?download=true&type=csv'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'File not found in storage bucket');
      });
    });
  });
});
