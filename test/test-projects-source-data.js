'use strict';
import { assert } from 'chai';
// import fs from 'fs';
import FormData from 'form-data';
import streamToPromise from 'stream-to-promise';

import initServer from '../app/services/server';
import db from '../app/db';
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

describe('Projects source data', function () {
  before('Before - Project files', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('POST /projects/{projId}/source-data', function () {
    it('should error when data format is not multipart/form-data', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/300/source-data'
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
          url: '/projects/300/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 404, 'Status code is 404');
          assert.equal(res.result.message, 'Project not found');
        });
    });

    it('should return 400 when project is not pending', function () {
      let form = new FormData();
      form.append('', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/2000/source-data',
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
          url: '/projects/1000/source-data',
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
          url: '/projects/1000/source-data',
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
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"source-name" must be one of [profile, origins, admin-bounds]');
        });
    });

    it('should error when invalid source-type is provided', function () {
      let form = new FormData();
      form.append('source-type', 'invalid');
      form.append('source-name', 'profile');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"source-type" for "profile" must be one of [file, default, wbcatalog]');
        });
    });
  });

  describe('POST /projects/{projId}/source-data -- file', function () {
    it('should error when file is missing', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'profile');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"file" is required');
        });
    });
  });

  describe('POST /projects/{projId}/source-data -- origins', function () {
    it('should error when available-ind is missing', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'origins');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"available-ind" is required');
        });
    });

    it('should error when available-ind is empty', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'origins');
      form.append('available-ind', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"available-ind" must not be empty');
        });
    });

    it('should error when indicators[key] is missing', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'origins');
      form.append('available-ind', 'value-1');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"indicators[key]" is required');
        });
    });

    it('should error when indicators[key] is empty', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'origins');
      form.append('available-ind', 'value-1');
      form.append('indicators[key]', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"indicators[key]" must not be empty');
        });
    });

    it('should error when indicators[label] is missing', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'origins');
      form.append('available-ind', 'value-1');
      form.append('indicators[key]', 'key-1');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"indicators[label]" is required');
        });
    });

    it('should error when indicators[label] is empty', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'origins');
      form.append('available-ind', 'value-1');
      form.append('indicators[key]', 'key-1');
      form.append('indicators[label]', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"indicators[label]" must not be empty');
        });
    });

    it('should error when indicators[key] and indicators[label] have different lengths', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'origins');
      form.append('available-ind', 'value-1');
      form.append('indicators[key]', 'key-1');
      form.append('indicators[label]', 'label-1');
      form.append('indicators[label]', 'label-2');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"indicators[key]" and "indicators[label]" must have the same number of values');
        });
    });

    it('should error when indicators[key] values are not in available-ind', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'origins');
      form.append('available-ind', 'value-1');
      form.append('indicators[key]', 'key-1');
      form.append('indicators[label]', 'label-1');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, 'Submitted indicator keys are not listed as available');
        });
    });

    it('should error on missing file when indicator info is correct', function () {
      let form = new FormData();
      form.append('source-type', 'file');
      form.append('source-name', 'origins');
      form.append('available-ind', 'ind-1');
      form.append('available-ind', 'ind-2');
      form.append('indicators[key]', 'ind-1');
      form.append('indicators[label]', 'label-1');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 404, 'Status code is 404');
          assert.equal(res.result.message, 'File not found');
        });
    });
  });

  describe('POST /projects/{projId}/source-data -- wbcatalog', function () {
    it('should error when wbcatalog-options[key] is missing', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'profile');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"wbcatalog-options[key]" is required');
        });
    });

    it('should error when wbcatalog-options[key] is empty', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'profile');
      form.append('wbcatalog-options[key]', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"wbcatalog-options[key]" must not be empty');
        });
    });

    it('should save key to the database for source-name profile', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'profile');
      form.append('wbcatalog-options[key]', 'key 1');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 200, 'Status code is 200');
          assert.equal(res.result.sourceType, 'wbcatalog');
          assert.equal(res.result.sourceName, 'profile');
        })
        .then(() => db('projects_source_data')
          .select('data')
          .where('project_id', 1000)
          .where('name', 'profile')
          .first()
        )
        .then(({data}) => {
          assert.deepEqual(data, [
            {key: 'key 1'}
          ]);
        });
    });

    it('should save first key to the database if multiple submitted', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'profile');
      form.append('wbcatalog-options[key]', 'key 1');
      form.append('wbcatalog-options[key]', 'key 2');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 200, 'Status code is 200');
          assert.equal(res.result.sourceType, 'wbcatalog');
          assert.equal(res.result.sourceName, 'profile');
        })
        .then(() => db('projects_source_data')
          .select('data')
          .where('project_id', 1000)
          .where('name', 'profile')
          .first()
        )
        .then(({data}) => {
          assert.deepEqual(data, [
            {key: 'key 1'}
          ]);
        });
    });
  });
});
