'use strict';
import { assert } from 'chai';

import initServer from '../app/services/server';

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

describe('root', function () {
  describe('endpoint /', function () {
    it('should have statusCode 200', function (done) {
      instance.injectThen({
        method: 'GET',
        url: '/'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        done();
      });
    });
  });
});
