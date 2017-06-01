'use strict';
import { assert } from 'chai';
import fs from 'fs';
import FormData from 'form-data';
import streamToPromise from 'stream-to-promise';

import Server from '../app/services/server';
import db from '../app/db';
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

describe('Scenario files', function () {
  before('Before - Scenario files', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('DELETE /projects/{projId}/scenarios/{scId}/files/{fileId}', function () {
    before(function (done) {
      db.insert({
        id: 10000001,
        name: 'road-network_000000',
        type: 'road-network',
        path: 'scenario-1000/road-network_000000',
        project_id: 1000,
        scenario_id: 1000
      })
      .into('scenarios_files')
      .then(() => done());
    });

    it('should return 404 for project not found', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/300/scenarios/1000/files/1000'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Project not found');
      });
    });

    it('should return 404 for scenario not found', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1000/scenarios/300/files/1000'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Scenario not found');
      });
    });

    it('should return 404 for file not found', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1001/scenarios/1001/files/300'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'File not found');
      });
    });

    it('should return 400 when project is not pending', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1100/scenarios/1100/files/1100'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.equal(res.result.message, 'Project no longer in the setup phase. Files can not be removed');
      });
    });

    it('should delete the file', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1000/scenarios/1000/files/10000001'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.message, 'File deleted');

        return db.select('*')
          .from('scenarios_files')
          .where('id', 10000001)
          .then(files => {
            assert.equal(files.length, 0);
          });
      });
    });
  });

  describe('POST /projects/{projId}/scenarios/{scId}/files', function () {
    it('should error when data format is not multipart/form-data', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios/1000/files'
      }).then(res => {
        assert.equal(res.statusCode, 415, 'Status code is 415');
        assert.equal(res.result.error, 'Unsupported Media Type');
      });
    });

    it('should error when type is not provided', function () {
      let form = new FormData();
      form.append('', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/files',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.match(res.result.message, /["type" is required]/);
        });
    });

    it('should error when file is not provided', function () {
      let form = new FormData();
      form.append('type', 'poi');

      return streamToPromise(form).then(payload => {
        return instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/files',
          payload,
          headers: form.getHeaders()
        }).then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.match(res.result.message, /"file" is required/);
        });
      });
    });

    it('should error when type is invalid', function () {
      let form = new FormData();
      form.append('type', 'invalid');

      return streamToPromise(form).then(payload => {
        return instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/files',
          payload,
          headers: form.getHeaders()
        }).then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          assert.match(res.result.message, /"type" must be one of \[road-network, poi\]/);
        });
      });
    });

    it('should return 404 for project not found', function () {
      let form = new FormData();
      form.append('type', 'poi');
      form.append('file', fs.createReadStream('./test/utils/data-sergipe/poi-townhalls.geojson'));

      return streamToPromise(form).then(payload => {
        return instance.injectThen({
          method: 'POST',
          url: '/projects/300/scenarios/1000/files',
          payload,
          headers: form.getHeaders()
        }).then(res => {
          assert.equal(res.statusCode, 404, 'Status code is 404');
          assert.equal(res.result.message, 'Project not found');
        });
      });
    });

    it('should return 404 for scenario not found', function () {
      let form = new FormData();
      form.append('type', 'poi');
      form.append('file', fs.createReadStream('./test/utils/data-sergipe/poi-townhalls.geojson'));

      return streamToPromise(form).then(payload => {
        return instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/300/files',
          payload,
          headers: form.getHeaders()
        }).then(res => {
          assert.equal(res.statusCode, 404, 'Status code is 404');
          assert.equal(res.result.message, 'Scenario not found');
        });
      });
    });

    it('should return 409 when the file already exists', function () {
      let form = new FormData();
      form.append('type', 'poi');
      form.append('file', fs.createReadStream('./test/utils/data-sergipe/poi-townhalls.geojson'));

      return streamToPromise(form).then(payload => {
        return instance.injectThen({
          method: 'POST',
          url: '/projects/1200/scenarios/1200/files',
          payload,
          headers: form.getHeaders()
        }).then(res => {
          assert.equal(res.statusCode, 409, 'Status code is 409');
          assert.equal(res.result.message, 'File already exists');
        });
      });
    });

    it('should upload the file', function () {
      let form = new FormData();
      form.append('type', 'poi');
      form.append('file', fs.createReadStream('./test/utils/data-sergipe/villages.geojson'));

      return streamToPromise(form).then(payload => {
        return instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios/1000/files',
          payload,
          headers: form.getHeaders()
        })
        .then(res => {
          assert.equal(res.statusCode, 200, 'Status code is 200');
          assert.match(res.result.fileName, /^poi_[0-9]+$/);
        })
        .then(() => {
          return db.select('*')
            .from('scenarios_files')
            .where('project_id', 1000)
            .where('scenario_id', 1000)
            .where('type', 'poi')
            .then(files => {
              assert.equal(files.length, 1);
              assert.equal(files[0].project_id, 1000);
              assert.match(files[0].name, /^poi_[0-9]+$/);
              assert.match(files[0].path, /scenario-1000\/poi_[0-9]+/);
            });
        })
        // Ensure that the project "updated_at" gets updated.
        .then(() => db.select('*')
          .from('projects')
          .where('id', 1000)
          .then(projects => {
            let now = ~~((new Date()).getTime() / 1000);
            let timestamp = ~~((new Date(projects[0].updated_at)).getTime() / 1000);
            assert.approximately(timestamp, now, 1);
          })
        );
      });
    });
  });

  describe('GET /projects/{projId}/scenarios/{scId}/files/{fileId}?download=true', function () {
    before(function (done) {
      // Add one file without an s3 representation.
      db.insert({
        id: 10000001,
        name: 'road-network_000000',
        type: 'road-network',
        path: 'scenario-1000/road-network_000000',
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

    it('should return 400 when download flag not true', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000/files/1?download=false'
      }).then(res => {
        assert.equal(res.statusCode, 501, 'Status code is 404');
        assert.equal(res.result.message, 'Query parameter "download" missing');
      });
    });

    it('should return 404 when a project is not found', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/300/scenarios/1000/files/1?download=true'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'File not found');
      });
    });

    it('should return 404 when a scenario is not found', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/300/files/1?download=true'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'File not found');
      });
    });

    it('should return 404 when a file is not found', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1003/scenarios/1003/files/1?download=true'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'File not found');
      });
    });

    it('should return 404 when a file is not found on s3', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000/files/10000001?download=true'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'File not found in storage bucket');
      });
    });

    it('should download a road-network file', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1004/scenarios/1004/files/1004?download=true'
      }).then(res => {
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /application\/xml/);
        assert.match(res.headers['content-disposition'], /road-network_000000/);
      });
    });

    it('should download a poi file', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1004/scenarios/1004/files/1005?download=true'
      }).then(res => {
        assert.equal(res.statusCode, 200);
        assert.match(res.headers['content-type'], /application\/json/);
        assert.match(res.headers['content-disposition'], /poi_000000/);
      });
    });
  });
});
