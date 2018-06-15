'use strict';
import path from 'path';
import Promise from 'bluebird';
import EventEmitter from 'events';

import config from '../../config';
import db from '../../db/';
import Operation from '../../utils/operation';
import AppLogger from '../../utils/app-logger';

import processAdminBounds from './admin-bounds';
import processRoadNetwork from './road-network';
import processProfile from './profile';
import processOrigins from './origins';
import processPoi from './poi';

const DEBUG = config.debug;
let appLogger = AppLogger({ output: DEBUG });
let logger;

// Emitter to manage execution order.
const projectSetupEmitter = new EventEmitter();

process.on('message', function (e) {
  // Capture all the errors.
  try {
    logger = appLogger.group(`p${e.projId} s${e.scId} proj-setup`);
    logger.log('init');
    e.callback = (err) => {
      if (err) return process.exit(1);
      else process.exit(0);
    };
    concludeProjectSetup(e);
  } catch (err) {
    process.send({type: 'error', data: err.message, stack: err.stack});
    throw err;
  }
});

// The project setup script is setup so that it run on a different node process
// using fork. This allows us to offload the main server not causing blocking
// operations.

/**
 * Finishes the project setup by processing all the needed files:
 * Road network:
 *   - Convert the osm file to a changeset and import it to the osm-p2p-db
 * Admin Bound:
 *   - Extract all the village names, and store them on the database. This is
 *   needed to later select what admin areas are to be processed.
 *
 * @param  {object} e       Data.
 *         e.opId           Operation Id. It has to be already started.
 *         e.projId         Project Id.
 *         e.scId           Scenario Id.
 *         e.callback
 */
export async function concludeProjectSetup (e) {
  const {opId, projId, scId, callback} = e;

  const op = new Operation(db);
  await op.loadById(opId);

  try {
    await Promise.all([
      processAdminBounds(projId, scId, {op, emitter: projectSetupEmitter, logger}),
      processProfile(projId, {logger}),
      processOrigins(projId, {op, logger}),
      processRoadNetwork(projId, scId, {op, emitter: projectSetupEmitter, logger, appLogger}),
      processPoi(projId, scId, {op, emitter: projectSetupEmitter, logger, appLogger})
    ]);

    // Update dates.
    await db.transaction(function (trx) {
      return Promise.all([
        trx('projects')
          .update({updated_at: (new Date()), status: 'active'})
          .where('id', projId),
        trx('scenarios')
          .update({updated_at: (new Date()), status: 'active'})
          .where('id', scId)
      ]);
    });

    // Finish operation.
    await op.log('success', {message: 'Operation complete'});
    await op.finish();

    logger && logger.log('process complete');
    DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../project-setup_p${projId}s${scId}.log`));
    callback();
  } catch (err) {
    logger && logger.log('error', err);
    DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../project-setup_p${projId}s${scId}.log`));
    await op.log('error', {error: err.message})
      .then(op => op.finish())
      .then(() => callback(err.message), () => callback(err.message));
  }
}
