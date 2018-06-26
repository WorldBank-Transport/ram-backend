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

const getBasePayload = () => {
  return {
    title: 'The title',
    country: 'Portugal',
    date: '2018-01-01',
    description: 'The description',
    authors: [{name: 'rural accessibility hub', id: 'rah'}],
    topics: [{name: 'rah'}],
    contactName: 'Rah export',
    contactEmail: 'email@example.com'
  };
};

describe('RAH Export', function () {
  before('Before - Rah export', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('POST /projects/{projId}/rah-export - field validation', function () {
    it('should fail when missing title', function () {
      let payload = getBasePayload();
      delete payload.title;
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["title" is required\]/);
      });
    });

    it('should fail when missing country', function () {
      let payload = getBasePayload();
      delete payload.country;
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["country" is required\]/);
      });
    });

    it('should fail when missing date', function () {
      let payload = getBasePayload();
      delete payload.date;
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["date" is required\]/);
      });
    });

    it('should fail when invalid date', function () {
      let payload = getBasePayload();
      payload.date = '2018-30-01';
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["date" must be a number of milliseconds or valid date string\]/);
      });
    });

    it('should fail when missing description', function () {
      let payload = getBasePayload();
      delete payload.description;
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["description" is required\]/);
      });
    });

    it('should fail when missing authors', function () {
      let payload = getBasePayload();
      delete payload.authors;
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["authors" is required\]/);
      });
    });

    it('should fail when invalid authors', function () {
      let payload = getBasePayload();
      payload.authors = 'oi';
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["authors" must be an array\]/);
      });
    });

    it('should fail when invalid authors 2', function () {
      let payload = getBasePayload();
      payload.authors = ['oi'];
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /must be an object/);
      });
    });

    it('should fail when missing topics', function () {
      let payload = getBasePayload();
      delete payload.topics;
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["topics" is required\]/);
      });
    });

    it('should fail when invalid topics', function () {
      let payload = getBasePayload();
      payload.topics = 'oi';
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["topics" must be an array\]/);
      });
    });

    it('should fail when invalid topics 2', function () {
      let payload = getBasePayload();
      payload.topics = ['oi'];
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /must be an object/);
      });
    });

    it('should fail when missing contactName', function () {
      let payload = getBasePayload();
      delete payload.contactName;
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["contactName" is required\]/);
      });
    });

    it('should fail when missing contactEmail', function () {
      let payload = getBasePayload();
      delete payload.contactEmail;
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["contactEmail" is required\]/);
      });
    });

    it('should fail when invalid contactEmail', function () {
      let payload = getBasePayload();
      payload.contactEmail = 'not an email';
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /\["contactEmail" must be a valid email\]/);
      });
    });
  });

  describe('POST /projects/{projId}/rah-export', function () {
    it('should fail when project is not found', function () {
      let payload = getBasePayload();
      return instance.injectThen({
        method: 'POST',
        url: '/projects/0000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.match(res.result.message, /Project not found/);
      });
    });

    it('should fail when project is pending', function () {
      let payload = getBasePayload();
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/rah-export',
        payload
      })
      .then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        assert.match(res.result.message, /Project setup not completed/);
      });
    });
  });
});
