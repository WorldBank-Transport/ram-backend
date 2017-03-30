'use strict';
import { assert } from 'chai';
import mockdate from 'mockdate';

import db from '../app/db';
import { setupStructure as setupDdStructure } from '../app/db/structure';
import { setupStructure as setupStorageStructure } from '../app/s3/structure';
import { fixMeUp } from './utils/data';
import Operation from '../app/utils/operation';

describe('Operation', function () {
  before(function (done) {
    setupDdStructure()
      .then(() => setupStorageStructure())
      .then(() => fixMeUp())
      .then(() => done());
  });

  describe('Create', function () {
    after(function () {
      // Clear the whole table
      return db('operations')
        .whereNot('id', -1)
        .del();
    });

    it('should throw error when creating an operation without a db connection', function () {
      // Wrap in a function to test.
      let fn = () => (new Operation());
      assert.throws(fn, 'Missing db instance', 'operation start()');
    });

    it('should throw error when starting with missing parameters', function () {
      let op = new Operation(db);

      assert.throws(op.start.bind(op), 'Missing parameters');
      assert.throws(op.start.bind(op, 'name'), 'Missing parameters');
      assert.throws(op.start.bind(op, 'name', 10), 'Missing parameters');
    });

    it('should throw error when finishing a non started operation', function () {
      let op = new Operation(db);

      return op.finish().catch(err => {
        assert.equal(err.message, 'Operation not running');
      });
    });

    it('should return a null for get commands of a non started operation', function () {
      let op = new Operation(db);
      assert.equal(op.getStatus(), null);
      assert.equal(op.getId(), null);
      assert.equal(op.getName(), null);
    });

    it('should start the operation', function () {
      mockdate.set(1000000000000);
      let op = new Operation(db);

      return op.start('operation-name', 1200, 1200).then(op => {
        let id = op.getId();
        assert.equal(typeof id, 'number');
        assert.isTrue(op.isStarted());
        assert.isFalse(op.isCompleted());
        assert.equal(op.getStatus(), Operation.status.running);
        assert.equal(op.getName(), 'operation-name');

        // Check db.
        return db('operations')
          .select('*')
          .where('id', id);
      })
      .then(res => {
        assert.equal(res[0].name, 'operation-name');
        assert.equal(res[0].project_id, 1200);
        assert.equal(res[0].scenario_id, 1200);
        assert.equal(res[0].status, Operation.status.running);
        let timestamp = (new Date(res[0].updated_at)).getTime();
        assert.equal(timestamp, 1000000000000);
        mockdate.reset();
      });
    });

    it('should throw error when starting the same operation twice', function () {
      let op = new Operation(db);

      return op.start('operation-name2', 1200, 1200)
        .then(op => op.start('operation-name2', 2000, 2000))
        .catch(err => assert.equal(err.message, 'Operation already running'));
    });

    it('should finish the operation', function () {
      let op = new Operation(db);
      return op.start('operation-name3', 1200, 1200)
        .then(op => {
          mockdate.set(1000000000010);
          assert.isTrue(op.isStarted());
          assert.isFalse(op.isCompleted());
          return op.finish();
        })
        .then(op => {
          assert.isFalse(op.isStarted());
          assert.isTrue(op.isCompleted());
          assert.equal(op.getStatus(), Operation.status.complete);
          // Check db.
          return db('operations')
            .select('*')
            .where('id', op.getId());
        })
        .then(res => {
          assert.equal(res[0].status, Operation.status.complete);
          let timestamp = (new Date(res[0].updated_at)).getTime();
          assert.equal(timestamp, 1000000000010);
          mockdate.reset();
        });
    });

    it('should throw error when restarting a finished operation', function () {
      let op = new Operation(db);
      return op.start('operation-name4', 1200, 1200)
        .then(op => op.finish())
        .then(op => op.start('operation-name', 1200, 1200))
        .catch(err => assert.equal(err.message, 'Operation already complete'));
    });

    it('should throw when starting a new operation with the name, projId and scId of a running operation', function () {
      let op = new Operation(db);
      let op2 = new Operation(db);
      return op.start('operation-name5', 1200, 1200)
        .then(() => op2.start('operation-name5', 1200, 1200))
        .catch(err => assert.equal(err.message, 'Operation with the same name, project_id and scenario_id is already running'));
    });

    it('should start a new operation with the name, projId and scId of a complete operation', function () {
      let op = new Operation(db);
      let op2 = new Operation(db);
      return op.start('operation-name6', 1200, 1200)
        .then(op => op.finish())
        .then(() => op2.start('operation-name7', 1200, 1200))
        .then(op2 => {
          assert.equal(op2.getName(), 'operation-name7');
          assert.notEqual(op2.getId(), op.getId());
        });
    });
  });

  describe('Load', function () {
    before(function () {
      // Create entry to use.
      return db('operations')
        .insert({
          id: 2000,
          name: 'op-load-test',
          project_id: 2000,
          scenario_id: 2000,
          status: Operation.status.running,
          created_at: (new Date()),
          updated_at: (new Date())
        });
    });

    after(function () {
      // Clear the whole table
      return db('operations')
        .whereNot('id', -1)
        .del();
    });

    it('should throw error loading a non existed operation by id', function () {
      let op = new Operation(db);

      return op.loadById(999)
        .catch(err => assert.equal(err.message, 'Operation does not exist'));
    });

    it('should throw error loading a non existed operation by data', function () {
      let op = new Operation(db);

      // proId, scId
      return op.loadByData('op-load-test', 999, 999)
        .catch(err => assert.equal(err.message, 'Operation does not exist'));
    });

    it('should load the operation by id', function () {
      let op = new Operation(db);

      return op.loadById(2000)
        .then(op => {
          assert.equal(op.getId(), 2000);
          assert.isTrue(op.isStarted());
          assert.isFalse(op.isCompleted());
          assert.equal(op.getStatus(), Operation.status.running);
          assert.equal(op.getName(), 'op-load-test');
        });
    });

    it('should load the operation by id', function () {
      let op = new Operation(db);

      // proId, scId
      return op.loadByData('op-load-test', 2000, 2000)
        .then(op => {
          assert.equal(op.getId(), 2000);
          assert.isTrue(op.isStarted());
          assert.isFalse(op.isCompleted());
          assert.equal(op.getStatus(), Operation.status.running);
          assert.equal(op.getName(), 'op-load-test');
        });
    });
  });

  describe('Log', function () {
    it('should throw error adding a log to a non running operation', function () {
      let op = new Operation(db);

      return op.log(1, {message: 'test1'})
        .catch(err => assert.equal(err.message, 'Operation not running'));
    });

    it('should throw error adding a log to a complete operation', function () {
      let op = new Operation(db);

      return op.start('operation-name-log', 1200, 1200)
        .then(op => op.finish())
        .then(op => op.log(1, {message: 'test2'}))
        .catch(err => assert.equal(err.message, 'Operation already complete'));
    });

    it('should add a log and update the operation timestamp', function () {
      let op = new Operation(db);
      let opId;

      return op.start('operation-name-log', 1200, 1200)
        .then(op => {
          mockdate.set(1000000000000);
          opId = op.getId();
          return op.log(1, {message: 'test3'});
        })
        .then(op => {
          // Check the db
          return db('operations')
            .select('*')
            .where('id', opId);
        })
        .then(res => {
          assert.equal(res[0].name, 'operation-name-log');
          let timestamp = (new Date(res[0].updated_at)).getTime();
          assert.equal(timestamp, 1000000000000, 'Operation timestamp');
        })
        .then(op => {
          // Check the db
          return db('operations_logs')
            .select('*')
            .where('operation_id', opId);
        })
        .then(res => {
          assert.equal(res[0].code, 1);
          assert.equal(res[0].data.message, 'test3');
          let timestamp = (new Date(res[0].created_at)).getTime();
          assert.equal(timestamp, 1000000000000, 'Operation log timestamp');
          mockdate.reset();
        });
    });

    it('should accept empty data', function () {
      let op = new Operation(db);

      return op.start('operation-name-log2', 1200, 1200)
        .then(op => op.log(1))
        .then(op => {
          // Check the db
          return db('operations_logs')
            .select('*')
            .where('operation_id', op.getId());
        })
        .then(res => {
          assert.equal(res[0].data, null);
        });
    });

    it('should convert any primitive used for data to json with message key', function () {
      let op = new Operation(db);

      return op.start('operation-name-log3', 1200, 1200)
        .then(op => op.log(1, 'the message'))
        .then(op => {
          // Check the db
          return db('operations_logs')
            .select('*')
            .where('operation_id', op.getId());
        })
        .then(res => {
          assert.equal(res[0].data.message, 'the message');
        });
    });

    it('should get all the operation logs', function () {
      let op = new Operation(db);

      return op.start('operation-name-log4', 1200, 1200)
        .then(op => op.log(1, {message: 'init'}))
        .then(op => op.log(2, {message: 'done', remaining: 4}))
        .then(op => op.log(2, {message: 'done', remaining: 3}))
        .then(op => op.log(2, {message: 'done', remaining: 2}))
        .then(op => op.fetchOperationLogs())
        .then(res => {
          assert.equal(res[0].data.remaining, 2);
          assert.equal(res[1].data.remaining, 3);
          assert.equal(res[2].data.remaining, 4);
          assert.equal(res[3].data.message, 'init');
        });
    });

    it('should get the last operation log', function () {
      let op = new Operation(db);

      return op.start('operation-name-log5', 1200, 1200)
        .then(op => op.log(1, {message: 'init'}))
        .then(op => op.log(2, {message: 'done', remaining: 4}))
        .then(op => op.log(2, {message: 'done', remaining: 3}))
        .then(op => op.log(2, {message: 'done', remaining: 2}))
        .then(op => op.fetchLastOperationLog())
        .then(res => {
          assert.equal(res[0].data.message, 'done');
          assert.equal(res[0].data.remaining, 2);
        });
    });
  });
});
