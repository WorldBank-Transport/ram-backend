'use strict';
import path from 'path';
import bbox from '@turf/bbox';

import config from '../../config';
import db from '../../db/';
import Operation from '../../utils/operation';
import { getFileContents, getJSONFileContents } from '../../s3/utils';
import { importRoadNetwork } from '../rra-osm-p2p';
import AppLogger from '../../utils/app-logger';

const DEBUG = config.debug;
let appLogger = AppLogger({ output: DEBUG });
let logger;

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
export function concludeProjectSetup (e) {
  const {opId, projId, scId, callback} = e;

  function processAdminAreas (adminBoundsFc) {
    logger && logger.log('process admin areas');

    let adminAreaTask = () => {
      return db.transaction(function (trx) {
        let adminAreas = adminBoundsFc.features
          .filter(o => !!o.properties.name && o.geometry.type !== 'Point')
          .map(o => ({name: o.properties.name, selected: false}));

        let adminAreasBbox = bbox(adminBoundsFc);

        return Promise.all([
          trx('projects')
            .update({
              bbox: JSON.stringify(adminAreasBbox),
              updated_at: (new Date())
            })
            .where('id', projId),
          trx('scenarios')
            .update({
              admin_areas: JSON.stringify(adminAreas),
              updated_at: (new Date())
            })
            .where('id', scId)
        ]);
      });
    };

    return op.log('process:admin-bounds', {message: 'Processing admin areas'})
      .then(() => adminAreaTask());
  }

  let op = new Operation(db);
  op.loadById(opId)
  .then(() => Promise.all([
    db('scenarios_files')
      .select('*')
      .where('project_id', projId)
      .where('type', 'road-network')
      .first()
      .then(file => getFileContents(file.path)),
    db('projects_files')
      .select('*')
      .where('project_id', projId)
      .where('type', 'admin-bounds')
      .first()
      .then(file => getJSONFileContents(file.path))
  ]))
  .then(filesContent => {
    let [roadNetwork, adminBoundsFc] = filesContent;
    // Run the tasks in series rather than in parallel.
    // This is better for error handling. If they run in parallel and
    // `processAdminAreas` errors, the script hangs a bit while
    // `processRoadNetwork` (which is resource intensive) finished and only then
    // the error is captured by the promise.
    // Since processing the admin areas is a pretty fast operation, the
    // performance is not really affected.
    return processAdminAreas(adminBoundsFc)
      .then(() => {
        logger && logger.log('process road network');
        return importRoadNetwork(projId, scId, op, roadNetwork);
      });
  })
  .then(() => {
    return db.transaction(function (trx) {
      return Promise.all([
        trx('projects')
          .update({updated_at: (new Date()), status: 'active'})
          .where('id', projId),
        trx('scenarios')
          .update({updated_at: (new Date()), status: 'active'})
          .where('id', scId)
      ])
      .then(() => op.log('success', {message: 'Operation complete'}).then(op => op.finish()));
    });
  })
  .then(() => {
    logger && logger.log('process complete');
    DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../project-setup_p${projId}s${scId}.log`));
    callback();
  })
  .catch(err => {
    logger && logger.log('error', err);
    DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../project-setup_p${projId}s${scId}.log`));
    return op.log('error', {error: err.message})
      .then(op => op.finish())
      .then(() => callback(err.message), () => callback(err.message));
  });
}
