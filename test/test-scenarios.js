'use strict';
import { assert } from 'chai';

import Server from '../app/services/server';
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

describe('Scenarios', function () {
  before(function (done) {
    dropScenariosFiles()
      .then(() => dropProjectsFiles())
      .then(() => dropScenarios())
      .then(() => dropProjects())
      .then(() => createProjectsTable())
      .then(() => createScenariosTable())
      .then(() => createProjectsFilesTable())
      .then(() => createScenariosFilesTable())
      .then(() => fixMeUp())
      .then(() => done());
  });

  describe('GET /projects/{projId}/scenarios', function () {
    it('should scenarios for project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200/scenarios'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.meta.found, 2);
        assert.equal(result.results[0].name, 'Main scenario 1200');
      });
    });

    it('should return 1 project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200/scenarios?limit=1&page=2'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.meta.found, 2);
        assert.equal(result.results[0].id, 1201);
        assert.equal(result.results[0].name, 'Scenario 1201');
      });
    });
  });

  describe('GET /projects/{projId}/scenarios/{scId}', function () {
    it('should return not found when getting non existent scenario', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/300'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return the correct scenario', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1000/scenarios/1000'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.id, 1000);
        assert.equal(res.result.name, 'Main scenario');
      });
    });
  });

  describe('GET /projects/{projId}/scenarios/0', function () {
    it('should return not found when getting non existent scenario', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/300/scenarios/0'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return the main project scenario', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1200/scenarios/0'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.id, 1200);
        assert.equal(res.result.name, 'Main scenario 1200');
      });
    });
  });
});
