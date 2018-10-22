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

    // Lock and queue to avoid race conditions.
    this.lock = false;
    this.queue = [];
    this.queueClearPromiseResolve = [];
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

  async _load (opts) {
    const op = await this.db(Operation.opTable)
      .select('*')
      .where(opts)
      .orderBy('created_at', 'desc')
      .first();

    if (!op) throw new Error('Operation does not exist');

    return this
      ._setId(op.id)
      ._setName(op.name)
      ._setStatus(op.status);
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
  async start (name, projId, scId) {
    if (!name || !projId || !scId) {
      throw new Error('Missing parameters');
    }

    if (this.isCompleted()) {
      throw new Error('Operation already complete');
    }

    if (this.isStarted()) {
      throw new Error('Operation already running');
    }

    // Check that there isn't another operation with the same values
    // that is not complete.
    const op = await this.db(Operation.opTable)
      .select('id')
      .where({
        name,
        project_id: projId,
        scenario_id: scId
      })
      .andWhereNot('status', Operation.status.complete)
      .first();

    if (op) throw new Error('Operation with the same name, project_id and scenario_id is already running');

    this.projId = projId;
    this.scId = scId;
    this
      ._setName(name)
      ._setStatus(Operation.status.running);

    const insert = await this.db(Operation.opTable)
      .returning('*')
      .insert({
        name,
        project_id: this.projId,
        scenario_id: this.scId,
        status: this.getStatus(),
        created_at: (new Date()),
        updated_at: (new Date())
      });

    this.id = insert[0].id;
    return this;
  }

  /**
   * Sets the status of the operation to complete.
   * If a log is provided creates a last log before finishing.
   *
   * @param  {String} code   Operation code
   * @param  {Any} data      Any arbitrary data. It will be stored as json
   *                         format. If `data` is not an object it will be
   *                         stored as {message: `data`}
   *
   * @return {Operation}     This operation instance
   */
  async finish (code, data = null) {
    if (this.isCompleted()) {
      throw new Error('Operation already complete');
    }

    if (!this.isStarted()) {
      throw new Error('Operation not running');
    }

    if (code) {
      if (data !== null && data.toString() !== '[object Object]') {
        data = {message: data};
      }

      // Queue tasks to be written to the database.
      this.queue.push({task: 'log', code, data});
    }

    this._setStatus(Operation.status.complete);
    this.queue.push({task: 'finish'});
    return this._reconcile();
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
   * Log an entry to the database.
   *
   * @param  {String} code   Operation code
   * @param  {Any} data      Any arbitrary data. It will be stored as json
   *                         format. If `data` is not an object it will be
   *                         stored as {message: `data`}
   * @return {Operation}     This operation instance
   */
  async log (code, data = null) {
    if (this.isCompleted()) {
      throw new Error('Operation already complete');
    }

    if (!this.isStarted()) {
      throw new Error('Operation not running');
    }

    if (data !== null && data.toString() !== '[object Object]') {
      data = {message: data};
    }

    // Queue tasks to be written to the database.
    this.queue.push({task: 'log', code, data});
    return this._reconcile();
  }

  /**
   * Writes the operations in queue to the database.
   */
  async _reconcile () {
    // If locked create a new promise that resolves when everythin is writtem.
    if (this.lock) {
      return new Promise(resolve => this.queueClearPromiseResolve.push(resolve));
    }
    // If the queue is clear, resolve all pending promises.
    if (!this.queue.length) {
      this.queueClearPromiseResolve.forEach(resolve => resolve(this));
      this.queueClearPromiseResolve = [];
      return this;
    }
    this.lock = true;

    const {task, code, data} = this.queue.shift();

    if (task === 'log') {
      await this.db.transaction(trx => {
        let date = new Date();
        return Promise.all([
          trx(Operation.opTable)
            .update({updated_at: date})
            .where('id', this.id),
          trx(Operation.logTable)
            .insert({
              operation_id: this.id,
              code,
              data,
              created_at: date
            })
        ]);
      });
    } else if (task === 'finish') {
      await this.db(Operation.opTable)
        .update({
          updated_at: (new Date()),
          status: Operation.status.complete
        })
        .where('id', this.id);
    } else {
      throw new Error('Invalid task');
    }

    this.lock = false;
    return this._reconcile();
  }

  /**
   * Returns all the operation logs.
   *
   * @return {Promise}     The db query. Results are sorted newest first.
   */
  fetchOperationLogs () {
    return this.db(Operation.logTable)
      .select('*')
      .where('operation_id', this.getId())
      .orderBy('id', 'desc');
  }

  /**
   * Returns the last the operation log.
   *
   * @return {Promise}     The db query.
   */
  fetchLastOperationLog () {
    return this.db(Operation.logTable)
      .select('*')
      .where('operation_id', this.getId())
      .orderBy('id', 'desc')
      .limit(1);
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
