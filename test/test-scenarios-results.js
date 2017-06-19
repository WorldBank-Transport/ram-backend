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

  describe('GET /projects/{projId}/scenarios/{scId}/results/geojson', function () {
    it.only('should return the correct scenario - active', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000/results/geojson'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.deepEqual(res.result.type, 'FeatureCollection');

        let ft = res.result.features;
        assert.equal(ft.length, 2);
        assert.equal(ft[0].type, 'Feature');
        assert.equal(ft[0].properties.id, 200001);
        assert.equal(ft[0].properties.eta0, 5000);
        assert.equal(ft[0].properties.eta1, 3500);
        assert.deepEqual(ft[0].properties.poi, ['school', 'church']);
        assert.equal(ft[1].properties.eta0, 54700);
        assert.deepEqual(ft[1].properties.poi, ['school']);
      });
    });
  });
});
