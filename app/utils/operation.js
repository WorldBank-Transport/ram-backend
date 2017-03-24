'use strict';

/**
 * Create a new Operation in the database.
 * This should be used to keep track of long running operations, that
 * require sending status updates to the user.
 * After creating an operation instance it is possible to store logs.
 *
 * @param {Object} db Database connection to use.
 *
 * @return {Operation} Instance of Operation
 *
 * @throws {MissingDB} If initialized without a db
 * @throws {OpComplete} If starting an operation already completed
 * @throws {OpRunning} If starting an operation that is already running
 * @throws {OpNotFound} If loading a non existent operation
 * @throws {OpNotRunning} If finishing a non running operation
 */
export default class Operation {
  constructor (db) {
    if (!db) throw new Error('Missing db instance');

    this.db = db;
    this
      ._setId(null)
      ._setName(null)
      ._setStatus(null);
  }

  _setStatus (status) {
    this.status = status;
    return this;
  }

  _setId (id) {
    this.id = id;
    return this;
  }

  _setName (name) {
    this.name = name;
    return this;
  }

  _load (opts) {
    return this.db(Operation.opTable)
      .select('*')
      .where(opts)
      .then(res => {
        if (!res.length) return Promise.reject(new Error('Operation does not exist'));
        let op = res[0];

        return this
          ._setId(op.id)
          ._setName(op.name)
          ._setStatus(op.status);
      }, err => Promise.reject(err));
  }

  /**
   * Start a new operation with the given name for the project/scenario.
   * There can't be two operations with the same name/project/scenario running
   * at the same time.
   *
   * @param  {String} name   Name of the operation
   * @param  {Number} projId Project Id
   * @param  {Number} scId   Scenario Id
   *
   * @return {Operation}     This operation instance
   */
  start (name, projId, scId) {
    if (!this.db) throw new Error('Missing db instance');

    if (!name || !projId || !scId) {
      throw new Error('Missing parameters');
    }

    if (this.isCompleted()) {
      return Promise.reject(new Error('Operation already complete'));
    }

    if (this.isStarted()) {
      return Promise.reject(new Error('Operation already running'));
    }

    // Check that there isn't another operation with the same values
    // that is not complete.
    return this.db(Operation.opTable)
      .select('id')
      .where({
        name,
        project_id: projId,
        scenario_id: scId
      })
      .andWhereNot('status', Operation.status.complete)
      .then(res => {
        if (res.length) {
          throw new Error('Operation with the same name, project_id and scenario_id is already running');
        }
      })
      .then(() => {
        this.projId = projId;
        this.scId = scId;
        this
          ._setName(name)
          ._setStatus(Operation.status.running);

        return this.db(Operation.opTable)
          .returning('*')
          .insert({
            name,
            project_id: this.projId,
            scenario_id: this.scId,
            status: this.getStatus(),
            created_at: (new Date()),
            updated_at: (new Date())
          });
      })
      .then(res => {
        this.id = res[0].id;
        return this;
      })
      .catch(err => {
        if (err.message.match(/Operation with the same/)) {
          return Promise.reject(err);
        }
        throw err;
      });
  }

  /**
   * Sets the status of the operation to complete.
   *
   * @return {Operation}     This operation instance
   */
  finish () {
    if (!this.db) throw new Error('Missing db instance');

    if (!this.isStarted()) {
      return Promise.reject(new Error('Operation not running'));
    }

    this._setStatus(Operation.status.complete);

    return this.db(Operation.opTable)
      .update({
        updated_at: (new Date()),
        status: this.getStatus()
      })
      .where('id', this.id)
      .then(res => {
        return this;
      }, err => Promise.reject(err));
  }

  /**
   * Load the operation by its id.
   *
   * @return {Operation}     This operation instance
   */
  loadById (id) {
    return this._load({id});
  }

  /**
   * Load the operation by name, project, scenario
   *
   * @param  {String} name   Name of the operation
   * @param  {Number} projId Project Id
   * @param  {Number} scId   Scenario Id
   *
   * @return {Operation}     This operation instance
   */
  loadByData (name, projId, scId) {
    return this._load({
      name,
      project_id: projId,
      scenario_id: scId
    });
  }

  /**
   * Get the operation id.
   *
   * @return {Number|Null}     The operation id or null if not started.
   */
  getId () {
    return this.id;
  }

  /**
   * Whether the operation was started.
   *
   * @return {Boolean}
   */
  isStarted () {
    return this.getStatus() === Operation.status.running;
  }

  /**
   * Whether the operation was completed.
   *
   * @return {Boolean}
   */
  isCompleted () {
    return this.getStatus() === Operation.status.complete;
  }

  /**
   * Get the operation status.
   *
   * @return {String|Null}     The operation status or null if not started.
   */
  getStatus () {
    return this.status;
  }

  /**
   * Get the operation name.
   *
   * @return {String|Null}     The operation name or null if not started.
   */
  getName () {
    return this.name;
  }
}

Operation.opTable = 'operations';
Operation.logTable = 'operations_logs';

Operation.status = {
  running: 'running',
  complete: 'complete'
};
