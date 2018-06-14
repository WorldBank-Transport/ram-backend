'use strict';
import { assert } from 'chai';
import fs from 'fs';
import FormData from 'form-data';
import streamToPromise from 'stream-to-promise';

import initServer from '../app/services/server';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import db from '../app/db';
import { setupStructure as setupStorageStructure } from '../app/s3/structure';
import { listFiles as listS3Files } from '../app/s3/utils';
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

describe('Scenarios', function () {
  before('Before - Scenarios', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('POST /projects/{projId}/scenarios', function () {
    it('should fail when creating a scenario without a name', function () {
      let form = new FormData();
      form.append('', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          var result = res.result;
          assert.match(result.message, /["name" is required]/);
        });
    });

    it('should not accept an empty name', function () {
      let form = new FormData();
      form.append('name', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          var result = res.result;
          assert.match(result.message, /["name" is not allowed to be empty]/);
        });
    });

    it('should not accept an empty description', function () {
      let form = new FormData();
      form.append('name', 'Scenario name');
      form.append('description', '');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          var result = res.result;
          assert.match(result.message, /["description" is not allowed to be empty]/);
        });
    });

    it('should require a value for road-network source', function () {
      let form = new FormData();
      form.append('name', 'Scenario name');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          var result = res.result;
          assert.match(result.message, /child "roadNetworkSource" fails because \["roadNetworkSource" is required\]/);
        });
    });

    it('should fail with invalid road-network source', function () {
      let form = new FormData();
      form.append('name', 'Scenario name');
      form.append('roadNetworkSource', 'invalid');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          var result = res.result;
          assert.match(result.message, /child "roadNetworkSource" fails because \["roadNetworkSource" must be one of \[clone, new, osm\]\]/);
        });
    });

    it('should require scenario id when road-network source is clone', function () {
      let form = new FormData();
      form.append('name', 'Scenario name');
      form.append('roadNetworkSource', 'clone');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          var result = res.result;
          assert.match(result.message, /child "roadNetworkSourceScenario" fails because \["roadNetworkSourceScenario" is required\]/);
        });
    });

    it('should require file when road-network source is new', function () {
      let form = new FormData();
      form.append('name', 'Scenario name');
      form.append('roadNetworkSource', 'new');

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          var result = res.result;
          assert.match(result.message, /child "roadNetworkFile" fails because \["roadNetworkFile" is required\]/);
        });
    });

    it('should return not found when creating a scenario for a non existent project', function () {
      let form = new FormData();
      form.append('name', 'Scenario name');
      form.append('roadNetworkSource', 'clone');
      form.append('roadNetworkSourceScenario', 1);
      form.append('poiSource', 'clone');
      form.append('poiSourceScenario', 1);

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/300/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 404, 'Status code is 404');
          assert.equal(res.result.message, 'Project not found');
        });
    });

    it('should return conflict for a non set up project', function () {
      let form = new FormData();
      form.append('name', 'Scenario name');
      form.append('roadNetworkSource', 'clone');
      form.append('roadNetworkSourceScenario', 1);
      form.append('poiSource', 'clone');
      form.append('poiSourceScenario', 1);

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1000/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 409, 'Status code is 409');
          assert.equal(res.result.message, 'Project setup not completed');
        });
    });

    it('should return bad request when then scenario to clone from does not exist', function () {
      let form = new FormData();
      form.append('name', 'Scenario name');
      form.append('roadNetworkSource', 'clone');
      form.append('roadNetworkSourceScenario', 1);
      form.append('poiSource', 'clone');
      form.append('poiSourceScenario', 1);

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1200/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 400, 'Status code is 400');
          var result = res.result;
          assert.equal(result.message, 'Source scenario for cloning not found');
        });
    });

    it('should return a conflict when using a name that already exists for another scenario of the same project', function () {
      let form = new FormData();
      form.append('name', 'Main scenario 1200');
      form.append('roadNetworkSource', 'clone');
      form.append('roadNetworkSourceScenario', 1200);
      form.append('poiSource', 'clone');
      form.append('poiSourceScenario', 1200);

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1200/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 409, 'Status code is 409');
          var result = res.result;
          assert.equal(result.message, 'Scenario name already in use for this project: Main scenario 1200');
        });
    });

    it('should create a pending scenario before starting the processing', function () {
      let form = new FormData();
      form.append('name', 'New scenario project 1200');
      form.append('roadNetworkSource', 'clone');
      form.append('roadNetworkSourceScenario', 1200);
      form.append('poiSource', 'clone');
      form.append('poiSourceScenario', 1200);

      return streamToPromise(form)
        .then(payload => instance.injectThen({
          method: 'POST',
          url: '/projects/1200/scenarios',
          payload,
          headers: form.getHeaders()
        }))
        .then(res => {
          assert.equal(res.statusCode, 200, 'Status code is 200');
          var result = res.result;
          assert.equal(result.name, 'New scenario project 1200');
          assert.equal(result.status, 'pending');
          assert.equal(result.master, false);
          assert.equal(result.project_id, 1200);
          assert.equal(typeof result.roadNetworkUpload, 'undefined');
          assert.equal(result.data.res_gen_at, 0);
          assert.equal(result.data.rn_updated_at, 0);
          assert.isArray(result.admin_areas, []);

          return result;
        });
    });

    it('should create a scenario with the file', function () {
      let form = new FormData();
      form.append('name', 'New scenario with file project 1200');
      form.append('roadNetworkSource', 'new');
      form.append('roadNetworkFile', fs.createReadStream('./test/utils/data-sergipe/road-network.osm'));
      form.append('poiSource', 'clone');
      form.append('poiSourceScenario', 1);

      return streamToPromise(form).then(payload => {
        return instance.injectThen({
          method: 'POST',
          url: '/projects/1200/scenarios',
          payload,
          headers: form.getHeaders()
        })
        .then(res => {
          assert.equal(res.statusCode, 200, 'Status code is 200');
          var result = res.result;
          assert.equal(result.name, 'New scenario with file project 1200');
          assert.equal(result.status, 'pending');
          assert.equal(result.master, false);
          assert.equal(result.project_id, 1200);
          assert.equal(typeof result.roadNetworkUpload, 'undefined');
          assert.equal(result.data.res_gen_at, 0);
          assert.equal(result.data.rn_updated_at, 0);

          return result;
        })
        .then(result => listS3Files(`scenario-${result.id}/road-network`)
          .then(objects => {
            let found = objects.some(o => o.name.match(/road-network_[0-9]+/));
            assert.isTrue(found, 'The road-network file was not found');
          })
        );
      });
    });
  });

  describe('POST /projects/{projId}/scenarios/{scId}/duplicate', function () {
    before(function (done) {
      // Add simple scenario for duplication.
      db.insert({
        id: 1200001,
        name: 'Main scenario 1200 (2)',
        project_id: 1200
      })
      .into('scenarios')
      .then(() => done());
    });

    after(function (done) {
      // cleanup
      db('scenarios')
        .where('id', 1200001)
        .del()
      .then(() => done());
    });

    it('should return not found when scenario to duplicate from does not exist', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios/8888/duplicate'
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        var result = res.result;
        assert.equal(result.message, 'Scenario not found');
      });
    });

    it('should duplicate a scenario with the correct name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios/1200/duplicate'
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'Main scenario 1200 (3)');
        assert.equal(result.status, 'pending');
        assert.equal(result.master, false);
        assert.equal(result.project_id, 1200);
        assert.equal(typeof result.roadNetworkUpload, 'undefined');
        assert.equal(result.data.res_gen_at, 0);
        assert.equal(result.data.rn_updated_at, 0);
        assert.isArray(result.admin_areas, []);

        return result;
      });
    });
  });
});
