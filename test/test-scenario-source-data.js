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
          assert.equal(res.result.message, '"source-type" for "poi" must be one of [file, osm, wbcatalog]');
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

  describe('POST /projects/{projId}/scenarios/{scId}/source-data -- poi-osm', function () {
    it('should error when osmPoiTypes is missing', function () {
      let form = new FormData();
      form.append('source-type', 'osm');
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
          assert.equal(res.result.message, '"osmPoiTypes" is required for source "poi"');
        });
    });

    it('should error when osmPoiTypes is invalid', function () {
      let form = new FormData();
      form.append('source-type', 'osm');
      form.append('source-name', 'poi');
      form.append('osmPoiTypes', 'invalid');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, 'POI type [invalid] not allowed. "osmPoiTypes" values must be any of [health, education, financial]');
        });
    });

    it('should error when one of osmPoiTypes is invalid', function () {
      let form = new FormData();
      form.append('source-type', 'osm');
      form.append('source-name', 'poi');
      form.append('osmPoiTypes', 'education');
      form.append('osmPoiTypes', 'invalid-2');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, 'POI type [invalid-2] not allowed. "osmPoiTypes" values must be any of [health, education, financial]');
        });
    });

    it('should store the osmPoiTypes in the database', function () {
      let form = new FormData();
      form.append('source-type', 'osm');
      form.append('source-name', 'poi');
      form.append('osmPoiTypes', 'education');
      form.append('osmPoiTypes', 'financial');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 200, 'Status code is 200');
          assert.equal(res.result.sourceType, 'osm');
          assert.equal(res.result.sourceName, 'poi');
        })
        .then(() => db('scenarios_source_data')
          .select('data')
          .where('scenario_id', 1000)
          .where('name', 'poi')
          .first()
        )
        .then(({data}) => {
          assert.equal(data.osmPoiTypes[0], 'education');
          assert.equal(data.osmPoiTypes[1], 'financial');
        });
    });
  });

  describe('POST /projects/{projId}/scenarios/{scId}/source-data -- wbcatalog', function () {
    it('should error when wbcatalog-options[key] is missing', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
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
          assert.equal(res.result.message, '"wbcatalog-options[key]" is required');
        });
    });

    it('should error when wbcatalog-options[key] is empty', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'poi');
      form.append('wbcatalog-options[key]', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"wbcatalog-options[key]" must not be empty');
        });
    });

    it('should error when wbcatalog-options[label] is missing - poi specific', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'poi');
      form.append('wbcatalog-options[key]', 'value');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"wbcatalog-options[label]" is required');
        });
    });

    it('should error when wbcatalog-options[label] is empty - poi specific', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'poi');
      form.append('wbcatalog-options[key]', 'value');
      form.append('wbcatalog-options[label]', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"wbcatalog-options[label]" must not be empty');
        });
    });

    it('should error when wbcatalog-options[key] and wbcatalog-options[label] have different lengths - poi specific', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'poi');
      form.append('wbcatalog-options[key]', 'value');
      form.append('wbcatalog-options[label]', 'label 1');
      form.append('wbcatalog-options[label]', 'label 2');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.equal(res.result.message, '"wbcatalog-options[key]" and "wbcatalog-options[label]" must have the same number of values');
        });
    });

    it('should disregard wbcatalog-options[label] when source-name is road-network', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'road-network');
      form.append('wbcatalog-options[key]', 'value');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 200, 'Status code is 200');
          assert.equal(res.result.sourceType, 'wbcatalog');
          assert.equal(res.result.sourceName, 'road-network');
        })
        .then(() => db('scenarios_source_data')
          .select('data')
          .where('scenario_id', 1000)
          .where('name', 'road-network')
          .first()
        )
        .then(({data}) => {
          assert.equal(data.resources[0].key, 'value');
        });
    });

    it('should save keys and lables to the database for source-name poi', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'poi');
      form.append('wbcatalog-options[key]', 'key 1');
      form.append('wbcatalog-options[key]', 'key 2');
      form.append('wbcatalog-options[label]', 'label 1');
      form.append('wbcatalog-options[label]', 'label 2');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 200, 'Status code is 200');
          assert.equal(res.result.sourceType, 'wbcatalog');
          assert.equal(res.result.sourceName, 'poi');
        })
        .then(() => db('scenarios_source_data')
          .select('data')
          .where('scenario_id', 1000)
          .where('name', 'poi')
          .first()
        )
        .then(({data}) => {
          assert.deepEqual(data, {
            resources: [
              {key: 'key 1', label: 'label 1'},
              {key: 'key 2', label: 'label 2'}
            ]
          });
        });
    });

    it('should save key to the database for source-name road-network', function () {
      let form = new FormData();
      form.append('source-type', 'wbcatalog');
      form.append('source-name', 'road-network');
      form.append('wbcatalog-options[key]', 'key road-network');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/source-data',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 200, 'Status code is 200');
          assert.equal(res.result.sourceType, 'wbcatalog');
          assert.equal(res.result.sourceName, 'road-network');
        })
        .then(() => db('scenarios_source_data')
          .select('data')
          .where('project_id', 1000)
          .where('name', 'road-network')
          .first()
        )
        .then(({data}) => {
          assert.deepEqual(data, {resources: [ {key: 'key road-network'} ]});
        });
    });
  });
});
