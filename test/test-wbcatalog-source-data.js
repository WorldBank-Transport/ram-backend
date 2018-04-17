'use strict';
import { assert } from 'chai';

import initServer from '../app/services/server';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { setupStructure as setupStorageStructure } from '../app/s3/structure';
import db from '../app/db';

import { checkValidSource, buildCache, getResourcesFromDb, CACHE_DAYS } from '../app/routes/wbcatalog-source-data';

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

describe.only('Wb Catalog Source Data', function () {
  before('Before - Wb Catalog Source Data', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => db.batchInsert('wbcatalog_resources', [
        {
          id: 1000,
          type: 'profile',
          name: 'Profile source name',
          resource_id: 'profile-id-1000',
          resource_url: 'http://example.com/profile.file',
          created_at: new Date()
        },
        {
          id: 1001,
          type: 'profile',
          name: 'Profile source name 2',
          resource_id: 'profile-id-1001',
          resource_url: 'http://example.com/profile2.file',
          created_at: new Date()
        },
        {
          id: 2000,
          type: 'admin',
          name: 'Admin source name',
          resource_id: 'admin-id-2000',
          resource_url: 'http://example.com/admin.file',
          // Make expired.
          created_at: new Date(Date.now() - (CACHE_DAYS + 1) * 86400 * 1000)
        }
      ]));
  });

  describe('POST /projects/wbcatalog-source-data', function () {
    it('should error when the source name is missing', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/wbcatalog-source-data',
        payload: {
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /child "sourceName" fails because \["sourceName" is required\]/);
      });
    });

    it('should error when the source name is invalid', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/wbcatalog-source-data',
        payload: {
          sourceName: 'invalid'
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /child "sourceName" fails because \["sourceName" must be one of \[origins, profile, admin\]\]/);
      });
    });

    it('should not find a valid source when source is expired', function () {
      return checkValidSource('admin')
        .then(isValid => assert.isFalse(isValid));
    });

    it('should not find a valid source when source has no data', function () {
      return checkValidSource('origins')
        .then(isValid => assert.isFalse(isValid));
    });

    it('should find a valid source when source has valid data', function () {
      return checkValidSource('profile')
        .then(isValid => assert.isTrue(isValid));
    });

    it('should return the correct resources from the database', function () {
      return getResourcesFromDb('profile')
        .then(data => {
          assert.deepEqual(data, [
            {
              name: 'Profile source name',
              resource_id: 'profile-id-1000'
            },
            {
              name: 'Profile source name 2',
              resource_id: 'profile-id-1001'
            }
          ]);
        });
    });

    it('should build cache from new data', function () {
      return buildCache('profile', [{
        id: 'profile-id-1003',
        name: 'The new profile',
        url: 'http://example.com/new-profile.file'
      }])
        // getResourcesFromDb was tested previously.
        .then(() => getResourcesFromDb('profile'))
        .then(data => {
          assert.deepEqual(data, [
            {
              name: 'The new profile',
              resource_id: 'profile-id-1003'
            }
          ]);
        });
    });
  });

  describe('POST /scenarios/wbcatalog-source-data', function () {
    it('should error when the source name is missing', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/scenarios/wbcatalog-source-data',
        payload: {
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /child "sourceName" fails because \["sourceName" is required\]/);
      });
    });

    it('should error when the source name is invalid', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/scenarios/wbcatalog-source-data',
        payload: {
          sourceName: 'invalid'
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        assert.match(res.result.message, /child "sourceName" fails because \["sourceName" must be one of \[poi, road-network\]\]/);
      });
    });
  });
});
