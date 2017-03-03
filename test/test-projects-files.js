'use strict';
import { assert } from 'chai';
import request from 'request';
import fs from 'fs';
import Promise from 'bluebird';

import Server from '../app/services/server';
import db from '../app/db';
import {
  dropScenariosFiles,
  dropProjectsFiles,
  dropScenarios,
  dropProjects,
  createProjectsTable,
  createScenariosTable,
  createProjectsFilesTable,
  createScenariosFilesTable
} from '../app/db/structure';
import { setupStructure } from '../app/s3/structure';
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

describe('Project files', function () {
  before(function (done) {
    dropScenariosFiles()
      .then(() => dropProjectsFiles())
      .then(() => dropScenarios())
      .then(() => dropProjects())
      .then(() => createProjectsTable())
      .then(() => createScenariosTable())
      .then(() => createProjectsFilesTable())
      .then(() => createScenariosFilesTable())
      .then(() => setupStructure())
      .then(() => fixMeUp())
      .then(() => done());
  });

  describe('DELETE /projects/{projId}/files/{fileId}', function () {
    before(function (done) {
      // Add one file to be removed.
      db.insert({
        'id': 10030001,
        'name': 'profile_000000',
        'type': 'profile',
        'path': 'project-1003/profile_000000',
        'project_id': 1003,
        'created_at': '2017-02-28T12:10:34.430Z',
        'updated_at': '2017-02-28T12:10:34.430Z'
      })
      .into('projects_files')
      .then(() => done());
    });

    it('should return 404 for project not found', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/300/files/1'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Project not found');
      });
    });

    it('should return 404 for file not found', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1001/files/300'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'File not found');
      });
    });

    it('should return 400 when project is not pending', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1100/files/1100'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.equal(res.result.message, 'Project no longer in the setup phase. Files can not be removed');
      });
    });

    it('should delete the file', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/1003/files/10030001'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.message, 'File deleted');

        return db.select('*')
          .from('projects_files')
          .where('id', 10030001)
          .then(files => {
            assert.equal(files.length, 0);
          });
      });
    });
  });

  describe('GET /projects/{projId}/upload', function () {
    it('should error when type is not provided', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/upload'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /["type" is required]/);
      });
    });

    it('should error when type is invalid', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/upload?type=invalid'
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["type" must be one of \[profile, villages, admin-bounds\]\]/);
      });
    });

    it('should return 404 for project not found', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/300/upload?type=profile'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Project not found');
      });
    });

    it('should return 409 when the file already exists', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200/upload?type=profile'
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        assert.equal(res.result.message, 'File already exists');
      });
    });

    it('should return presigned url', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/upload?type=villages'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.match(res.result.fileName, /^villages_[0-9]+$/);
        assert.match(res.result.presignedUrl, /project-1000\/villages_[0-9]+/);
      });
    });
  });

  describe('File upload end-to-end', function () {
    // This tests the full file upload process:
    // - Getting the presigned url.
    // - Uploading the file.
    // - Checking that the database was updated.
    it('should upload a file', function () {
      this.slow(150);
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/upload?type=villages'

      // Get url.
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.match(res.result.fileName, /^villages_[0-9]+$/);
        assert.match(res.result.presignedUrl, /project-1000\/villages_[0-9]+/);

        return res.result.presignedUrl;
      })

      // Upload file.
      .then(presignedUrl => {
        let reqPromise = new Promise((resolve, reject) => {
          let req = request.put(presignedUrl, (err, resp, body) => {
            if (err) return reject(err);
            return resolve();
          });
          let form = req.form();
          form.append('file', fs.createReadStream('./test/utils/test-file'));
        });

        return reqPromise;
      })

      // Wait...
      // The server is listening for the s3 notification. We have to give it
      // time to resolve...
      // So, try up to 3 times to check that the data is in the db.
      .then(() => {
        return new Promise((resolve, reject) => {
          let tries = 3;
          const retry = (delay, err) => {
            if (--tries === 0) return reject(err);
            setTimeout(() => fn(delay * 2), delay);
          };

          const fn = (delay) => {
            db.select('*')
              .from('projects_files')
              .where('project_id', 1000)
              .where('type', 'villages')
              .then(files => {
                assert.equal(files.length, 1);
                assert.equal(files[0].project_id, 1000);
                assert.match(files[0].name, /^villages_[0-9]+$/);
                assert.match(files[0].path, /project-1000\/villages_[0-9]+/);
                resolve();
              })
              .catch((err) => retry(delay, err));
          };

          fn(10);
        });
      });
    });
  });
});
