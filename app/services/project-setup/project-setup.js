'use strict';
import path from 'path';
import Promise from 'bluebird';

import config from '../../config';
import db from '../../db/';
import Operation from '../../utils/operation';
import AppLogger from '../../utils/app-logger';

import processAdminBounds from './admin-bounds';
import processRoadNetwork from './road-network';
import processProfile from './profile';
import processOrigins from './origins';
import processPoi from './poi';
import { ProjectEventEmitter } from './common';

const DEBUG = config.debug;
let appLogger = AppLogger({ output: DEBUG });
let logger;

// Emitter to manage execution order.
const projectSetupEmitter = new ProjectEventEmitter();

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
 * Finishes the project setup by processing all the needed files.
 * The type of processing done to each file depends on the source and
 * different sources have different processing dependencies as outlined below:
 *
 * Road Network:
 *  Catalog:
 *    - Download from server
 *    - Set editable setting
 *    - Import into osm-p2p (depends on size)
 *    - Create vector tiles
 *  OSM:
 *    - Import from overpass *
 *    - Set editable setting
 *    - Import into osm-p2p (depends on size)
 *    - Create vector tiles
 *  File:
 *    - Set editable setting
 *    - Import into osm-p2p (depends on size)
 *    - Create vector tiles
 *
 * Profile:
 *  Catalog:
 *    - Download from server
 *  Default:
 *    - Copy default profile
 *  File:
 *    - No action
 *
 * Admin bounds
 *  Catalog:
 *    - Download from server
 *    - Cleanup and store in DB
 *    - Create vector tiles
 *  File:
 *    - Cleanup and store in DB
 *    - Create vector tiles
 *
 * Origins
 *  Catalog:
 *    - Download from server
 *    - Cleanup and store in DB
 *  File:
 *    - Cleanup and store in DB
 *
 * Points of interest:
 *  Catalog:
 *    - Download from server
 *    - Import into osm-p2p **
 *  OSM:
 *    - Import from overpass *
 *    - Import into osm-p2p **
 *  File:
 *    - Import into osm-p2p **
 *
 * Notes:
 *    * Depends on the admin bounds bounding box
 *    ** Depends on the RN editable setting
 *
 * Since the execution order depends a lot on the source, all the processing
 * is started simultaneously, but then the processes wait for each other using
 * events. Once a process reaches a point where it needs data from another
 * it will trigger a emitter.waitForEvents(events...) that will only
 * resolve once all the events have fired.
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
    console.log('err', err);
    logger && logger.log('error', err);
    DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../project-setup_p${projId}s${scId}.log`));
    try {
      await op.finish('error', {error: err.message});
    } catch (e) { /* no-action */ }
    callback(err);
  }
}
