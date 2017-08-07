'use strict';
import { assert } from 'chai';
// import fs from 'fs';
import FormData from 'form-data';
import streamToPromise from 'stream-to-promise';

import initServer from '../app/services/server';
// import db from '../app/db';
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

describe('Scenario source data', function () {
  before('Before - Project files', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('POST /projects/{projId}/scenarios/{scId}/source-data', function () {
    it('should error when data format is not multipart/form-data', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/300/scenarios/300/source-data'
      }).then(res => {
        assert.equal(res.statusCode, 415, 'Status code is 415');
        assert.equal(res.result.error, 'Unsupported Media Type');
      });
    });

    it('should return 404 for a project not found', function () {
      let form = new FormData();
      form.append('', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/300/scenarios/300/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 404, 'Status code is 404');
          assert.equal(res.result.message, 'Project not found');
        });
    });

    it('should return 404 for a scenario not found', function () {
      let form = new FormData();
      form.append('', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/300/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 404, 'Status code is 404');
          assert.equal(res.result.message, 'Scenario not found');
        });
    });

    it('should return 400 when project is not pending', function () {
      let form = new FormData();
      form.append('', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/2000/scenarios/2000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, 'Project no longer in the setup phase. Source data can not be uploaded');
        });
    });

    it('should error when source-type is not provided', function () {
      let form = new FormData();
      form.append('', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.match(res.result.message, /"source-type" is required/);
        });
    });

    it('should error when source-name is not provided', function () {
      let form = new FormData();
      form.append('source-type', 'file');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.match(res.result.message, /"source-name" is required/);
        });
    });

    it('should error when invalid source-name is provided', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'invalid');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"source-name" must be one of [poi, road-network]');
        });
    });

    it('should error when invalid source-type is provided', function () {
      let form = new FormData();
      form.append('source-type', 'invalid');
      form.append('source-name', 'poi');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"source-type" must be one of [osm, file]');
        });
    });
  });

  describe('POST /projects/{projId}/scenarios/{scId}/source-data -- file', function () {
    it('should error when file is missing', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'road-network');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"file" is required');
        });
    });
  });
});
