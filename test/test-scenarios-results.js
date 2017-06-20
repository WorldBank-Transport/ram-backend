'use strict';
import { assert } from 'chai';

import Server from '../app/services/server';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { setupStructure as setupStorageStructure } from '../app/s3/structure';
import { fixMeUp } from './utils/data';

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

describe('Scenario results', function () {
  before('Before - Scenario results', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('GET /projects/{projId}/scenarios/{scId}/results/geo', function () {
    it('should return the correct results for a scenario', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000/results/geo'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.deepEqual(res.result.meta, {
          'poi_type': [ 'school', 'church' ],
          'pop_type': [ 'population' ],
          'maxPop': [ 48733 ]
        });

        let ft = res.result.results;
        assert.equal(ft.length, 3);
        assert.deepEqual(ft[0], {
          'n': 'Paripiranga',
          'i': 200001,
          'e-0': 5000,
          'e-1': 3500,
          'p-0': 29459,
          'pn-0': 0.6,
          'c': [-37.86215, -10.68289]
        });
        assert.equal(ft[1]['e-0'], 54700);
        assert.equal(ft[1]['e-1'], undefined);
      });
    });
  });
});
