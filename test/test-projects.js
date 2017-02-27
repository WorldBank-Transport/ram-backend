'use strict';
import { assert } from 'chai';

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

describe('projects', function () {
  after(function () {
    db.destroy();
  });

  before(function (done) {
    dropScenariosFiles()
      .then(() => dropProjectsFiles())
      .then(() => dropScenarios())
      .then(() => dropProjects())
      .then(() => createProjectsTable())
      .then(() => createScenariosTable())
      .then(() => createProjectsFilesTable())
      .then(() => createScenariosFilesTable())
      .then(() => {
        const projects = [
          {
            id: 1,
            name: 'Project 1',
            description: 'Sample project no 1',
            status: 'pending',
            created_at: (new Date()),
            updated_at: (new Date())
          },
          {
            id: 2,
            name: 'Project 2',
            description: 'Sample project no 2',
            status: 'pending',
            created_at: (new Date()),
            updated_at: (new Date())
          },
          {
            id: 3,
            name: 'Project to delete',
            description: 'Sample project',
            status: 'pending',
            created_at: (new Date()),
            updated_at: (new Date())
          },
          {
            id: 4,
            name: 'Project to update',
            description: 'Sample project',
            status: 'pending',
            created_at: '2017-02-21T00:00:00.000Z',
            updated_at: '2017-02-21T00:00:00.000Z'
          }
        ];

        db.batchInsert('projects', projects)
        // Inserting a value for the auto increment column does not move the internal
        // sequence pointer, therefore we need to do it manually.
        .then(() => db.raw(`ALTER SEQUENCE projects_id_seq RESTART WITH ${projects.length + 1};`))
        .then(() => done());
      });
  });

  describe('GET /projects', function () {
    it('should return projects', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.meta.found, 4);
        assert.equal(result.results[0].name, 'Project 1');
      });
    });

    it('should return 1 project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects?limit=1&page=2'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.meta.found, 4);
        assert.equal(result.results[0].id, 2);
        assert.equal(result.results[0].status, 'pending');
        assert.equal(result.results[0].name, 'Project 2');
      });
    });
  });

  describe('GET /projects/{projId}', function () {
    it('should return not found when getting non existent project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/10'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return the correct project', function () {
      return instance.injectThen({
        method: 'GET',
        url: '/projects/1'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.id, 1);
        assert.equal(res.result.name, 'Project 1');
      });
    });
  });

  describe('DELETE /projects/{projId}', function () {
    it('should return not found when deleting non existent project', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/10'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should delete a project', function () {
      return instance.injectThen({
        method: 'DELETE',
        url: '/projects/3'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        assert.equal(res.result.message, 'Project deleted');
      });
    });
  });

  describe('POST /projects', function () {
    it('should fail when creating a project without a name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["name" is required]/);
      });
    });

    it('should create a project with just the name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Project created'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'Project created');
        assert.equal(result.status, 'pending');
        assert.equal(result.description, null);
      });
    });

    it('should return a conflict when creating a project with the same name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Project created'
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Project name already in use: Project created');
      });
    });

    it('should create a project with all properties', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects',
        payload: {
          name: 'Project with all properties',
          description: 'This is the description'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'Project with all properties');
        assert.equal(result.description, 'This is the description');
      });
    });
  });

  describe('PATCH /projects/{projId}', function () {
    it('should return not found when patching a non existent project', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/10',
        payload: {
        }
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
      });
    });

    it('should return a conflict when setting a name that already exists', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/4',
        payload: {
          name: 'Project 1'
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Project name already in use: Project 1');
      });
    });

    it('should not accept an empty name', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/4',
        payload: {
          name: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["name" is not allowed to be empty]/);
      });
    });

    it('should change the project name', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/4',
        payload: {
          name: 'New name'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'New name');
      });
    });

    it('should not accept an empty description', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/4',
        payload: {
          description: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["description" is not allowed to be empty]/);
      });
    });

    it('should accept a null description', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/4',
        payload: {
          description: null
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.description, null);
      });
    });

    it('should update all values', function () {
      return instance.injectThen({
        method: 'PATCH',
        url: '/projects/4',
        payload: {
          name: 'updated name',
          description: 'updated description'
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'updated name');
        assert.equal(result.description, 'updated description');
        assert.notEqual(result.created_at, result.updated_at);
      });
    });
  });
});
