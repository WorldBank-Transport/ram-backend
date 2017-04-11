'use strict';
import { assert } from 'chai';

import Server from '../app/services/server';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { setupStructure as setupStorageStructure } from '../app/s3/structure';
import { fixMeUp, ADMIN_AREAS } from './utils/data';
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

describe.only('Result generation', function () {
  before('Before - Result generation', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('POST /projects/{projId}/scenarios/{scId}/generate', function () {
    it('should return not found when getting non existent project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/300/scenarios/300/generate'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Project not found');
      });
    });

    it('should return not found when getting non existent scenario', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/2000/scenarios/300/generate'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Scenario not found');
      });
    });

    it('should return error when the project setup is not complete', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios/1000/generate'
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        assert.equal(res.result.message, 'Project setup not completed');
      });
    });

    it('should return error when no admin areas are selected', function () {
      // Modify db entry.
      return db('scenarios')
        .update({
          admin_areas: JSON.stringify([{name: 'test-area', selected: false}])
        })
        .where('id', 2000)
        .then(() => instance.injectThen({
          method: 'POST',
          url: '/projects/2000/scenarios/2000/generate'
        }))
        .then(res => {
          assert.equal(res.statusCode, 409, 'Status code is 409');
          assert.equal(res.result.message, 'No admin areas selected');
        })
        // Set admin areas back to original.
        .then(() => db('scenarios')
          .update({admin_areas: JSON.stringify(ADMIN_AREAS)})
          .where('id', 2000)
        );
    });

    it('should remove old results and start generation', function () {
      // Insert some dummy files to ensure they're deleted.
      return db.batchInsert('scenarios_files', [
        {
          'name': 'results',
          'type': 'results',
          'path': 'scenario-2000/results_000000',
          'project_id': 2000,
          'scenario_id': 2000,
          'created_at': '2017-02-01T12:00:03.000Z',
          'updated_at': '2017-02-01T12:00:03.000Z'
        },
        {
          'name': 'results-all',
          'type': 'results-all',
          'path': 'scenario-2000/results-all_000000',
          'project_id': 2000,
          'scenario_id': 2000,
          'created_at': '2017-02-01T12:00:03.000Z',
          'updated_at': '2017-02-01T12:00:03.000Z'
        }
      ])
      .then(() => instance.injectThen({
        method: 'POST',
        url: '/projects/2000/scenarios/2000/generate'
      }))
      .then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.message, 'Result generation started');
      })
      // Check the files table.
      .then(() => db('scenarios_files')
        .select('*')
        .where('scenario_id', 2000)
        .whereIn('type', ['results', 'results-all'])
      )
      .then(files => {
        assert.lengthOf(files, 0, 'Scenario results is empty');
      })
      // Check the operations table.
      .then(() => db('operations')
        .select('*')
        .where('scenario_id', 2000)
        .where('project_id', 2000)
        .where('name', 'generate-analysis')
      )
      .then(op => {
        assert.equal(op[0].status, 'running');
      });
    });

    it('should throw error if the results generation is already running', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/2000/scenarios/2000/generate'
      })
      .then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        assert.equal(res.result.message, 'Result generation already running');
      });
    });
  });
});
