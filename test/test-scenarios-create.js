'use strict';
import { assert } from 'chai';

import Server from '../app/services/server';
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

describe('Scenarios', function () {
  before('Before - Scenarios', function () {
    this.timeout(5000);
    return setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp());
  });

  describe('POST /projects/{projId}/scenarios', function () {
    it('should fail when creating a scenario without a name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["name" is required]/);
      });
    });

    it('should not accept an empty name', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["name" is not allowed to be empty]/);
      });
    });

    it('should not accept an empty description', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name',
          description: ''
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /["description" is not allowed to be empty]/);
      });
    });

    it('should require a value for road-network source', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name'
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /child "roadNetworkSource" fails because \["roadNetworkSource" is required\]/);
      });
    });

    it('should fail with invalid road-network source', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name',
          roadNetworkSource: 'invalid'
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /child "roadNetworkSource" fails because \["roadNetworkSource" must be one of \[clone, new\]\]/);
      });
    });

    it('should require scenario id when road-network source is clone', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name',
          roadNetworkSource: 'clone'
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.match(result.message, /child "roadNetworkSourceScenario" fails because \["roadNetworkSourceScenario" is required\]/);
      });
    });

    it('should return not found when creating a scenario for a non existent project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/300/scenarios',
        payload: {
          name: 'Scenario name',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1
        }
      }).then(res => {
        assert.equal(res.statusCode, 404, 'Status code is 404');
        assert.equal(res.result.message, 'Project not found');
      });
    });

    it('should return conflict for a non set up project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1000/scenarios',
        payload: {
          name: 'Scenario name',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        assert.equal(res.result.message, 'Project setup not completed');
      });
    });

    it('should return bad request when then scenario to clone from does not exist', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios',
        payload: {
          name: 'New scenario',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1
        }
      }).then(res => {
        assert.equal(res.statusCode, 400, 'Status code is 400');
        var result = res.result;
        assert.equal(result.message, 'Source scenario for cloning not found');
      });
    });

    it('should return a conflict when using a name that already exists for another scenario of the same project', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios',
        payload: {
          name: 'Main scenario 1200',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1200
        }
      }).then(res => {
        assert.equal(res.statusCode, 409, 'Status code is 409');
        var result = res.result;
        assert.equal(result.message, 'Scenario name already in use for this project: Main scenario 1200');
      });
    });

    it('should create a pending scenario before starting the processing', function () {
      return instance.injectThen({
        method: 'POST',
        url: '/projects/1200/scenarios',
        payload: {
          name: 'New scenario project 1200',
          roadNetworkSource: 'clone',
          roadNetworkSourceScenario: 1200
        }
      }).then(res => {
        assert.equal(res.statusCode, 200, 'Status code is 200');
        var result = res.result;
        assert.equal(result.name, 'New scenario project 1200');
        assert.equal(result.status, 'pending');
        assert.equal(result.master, false);
        assert.equal(result.project_id, 1200);
        assert.equal(typeof result.roadNetworkUpload, 'undefined');
        assert.equal(result.data.res_gen_at, 0);
        assert.equal(result.data.rn_updated_at, 0);

        return result;
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

        return result;
      });
    });
  });
});
