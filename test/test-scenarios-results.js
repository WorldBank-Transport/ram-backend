'use strict';
import { assert } from 'chai';
import _ from 'lodash';

import initServer from '../app/services/server';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { setupStructure as setupStorageStructure } from '../app/s3/structure';
import { fixMeUp } from './utils/data';

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

describe('Scenario results', function () {
  before('Before - Scenario results', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('GET /projects/{projId}/scenarios/{scId}/results/geo', function () {
    it('should return the correct results for a scenario, type school', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000/results/geo?poiType=school&popInd=population'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        // It is not important fot the query result to be sorted, but we need
        // to ensure order for the tests.
        let origins = _.sortBy(res.result, 'i');
        assert.equal(origins.length, 3);
        assert.deepEqual(origins[0], {
          'n': 'Paripiranga',
          'i': 200001,
          'e': 5000,
          'p': 29459,
          'pn': 0.6,
          'c': [-37.86215, -10.68289]
        });
      });
    });
    it('should return the correct results for a scenario, type church', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000/results/geo?poiType=church&popInd=population'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        // It is not important fot the query result to be sorted, but we need
        // to ensure order for the tests.
        let origins = _.sortBy(res.result, 'i');
        assert.equal(origins.length, 2);
        assert.equal(origins[1].e, 350000);
      });
    });
    it('should return an error for unknown POI types', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000/results/geo?poiType=mockery&popInd=population'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.equal(res.result.message, '"poiType" must be one of [church, school]');
      });
    });
  });
});
