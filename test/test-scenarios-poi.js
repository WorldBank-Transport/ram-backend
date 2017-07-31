'use strict';
import { assert } from 'chai';

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

describe('Scenarios Poi', function () {
  before('Before - Scenarios', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('GET /projects/{projId}/scenarios/{scId}/poi', function () {
    it('should return error when type is missing', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000/poi'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /["type" is required]/);
      });
    });

    it('should return not found for invalid type', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000/poi?type=invalid'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return the correct data', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/2000/scenarios/2000/poi?type=pointOfInterest'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        let data = res.result;
        assert.deepEqual(data, [
          { i: 0, c: [ -37.50811, -11.52502 ] },
          { i: 1, c: [ -37.62598, -11.14786 ] },
          { i: 2, c: [ -38.00331, -11.18805 ] },
          { i: 3, c: [ -37.67609, -11.19296 ] },
          { i: 4, c: [ -37.65658, -11.38247 ] },
          { i: 5, c: [ -37.78638, -11.27597 ] }
        ]);
      });
    });
  });
});
