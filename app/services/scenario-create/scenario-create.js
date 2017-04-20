'use strict';
import path from 'path';
import Promise from 'bluebird';

import config from '../../config';
import { cloneDatabase, removeDatabase } from '../rra-osm-p2p';
import db from '../../db/';
import { bucket } from '../../s3';
import { copyFile } from '../../s3/utils';
import { emptyBucket } from '../../s3/structure';
import Operation from '../../utils/operation';
import AppLogger from '../../utils/app-logger';

const DEBUG = config.debug;
let appLogger = AppLogger({ output: DEBUG });
let logger;

process.on('message', function (e) {
  // Capture all the errors.
  try {
    logger = appLogger.group(`p${e.projId} s${e.scId} scen-create`);
    logger.log('init');
    e.callback = (err) => {
      if (err) return process.exit(1);
      else process.exit(0);
    };
    scenarioCreate(e);
  } catch (err) {
    process.send({type: 'error', data: err.message, stack: err.stack});
    throw err;
  }
});

// The scenario create script is setup so that it run on a different node process
// using fork. This allows us to offload the main server not causing blocking
// operations.

/**
 *
 * @param  {object} e       Data.
 *         e.opId           Operation Id. It has to be already started.
 *         e.projId         Project Id.
 *         e.scId           Scenario Id.
 *         e.callback
 */
export function scenarioCreate (e) {
  const {projId, scId, source, sourceScenarioId, opId, callback} = e;

  let op = new Operation(db);
  let executor = op.loadById(opId)
    .then(op => op.log('admin-areas', {message: 'Cloning admin areas'}));

  if (source === 'clone') {
    executor = executor.then(() => db.transaction(function (trx) {
      // Get the admin areas from the master scenario.
      return trx('scenarios')
        .select('*')
        .where('project_id', projId)
        .where('master', true)
        .first()
        .then(scenario => scenario.admin_areas.map(o => {
          o.selected = false;
          return o;
        }))
        .then(adminAreas => trx('scenarios')
          .update({
            admin_areas: JSON.stringify(adminAreas),
            updated_at: (new Date())
          })
          .where('id', scId)
        )
        // Copy the scenario files.
        .then(() => op.log('files', {message: 'Cloning files'}))
        .then(() => trx('scenarios_files')
          .select('*')
          .where('scenario_id', sourceScenarioId)
          .where('project_id', projId)
          .whereIn('type', ['poi', 'road-network'])
          .then(files => cloneScenarioFiles(trx, files, projId, scId))
        )
        // Copy the osm-p2p-db.
        .then(() => op.log('files', {message: 'Cloning road network database'}))
        .then(() => cloneOsmP2Pdb(projId, sourceScenarioId, projId, scId))
        .then(() => trx('scenarios').update({status: 'active', updated_at: (new Date())}).where('id', scId))
        .then(() => trx('projects').update({updated_at: (new Date())}).where('id', projId))
        .then(() => op.log('success', {message: 'Operation complete'}).then(op => op.finish()));
    }));
  } else if (source === 'new') {
    
  }

  executor
    // Note: There's no need to close the osm-p2p-db because when the process
    // terminates the connection is automatically closed.
    .then(() => {
      logger && logger.log('process complete');
      DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../scenario-create_p${projId}s${scId}.log`));
      callback();
    })
    .catch(err => {
      logger && logger.log('error', err);
      DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../scenario-create_p${projId}s${scId}.log`));

      return op.log('error', {error: err.message})
        .then(() => op.finish())
        // If the process fails do some cleanup of what was not in
        // a transaction, namely the files, and the originally create scenario.
        // .then(() => onFailCleanup(projId, scId))
        .then(() => callback(err.message), () => callback(err.message));
    });
}

// Copies the given files from a to the new scenario, both the database entries
// and the physical file.
function cloneScenarioFiles (trx, files, projId, scId) {
  logger && logger.log('cloning files');
  let newFiles = files.map(file => {
    const fileName = `${file.type}_${Date.now()}`;
    const filePath = `scenario-${scId}/${fileName}`;

    return {
      name: fileName,
      type: file.type,
      path: filePath,
      project_id: projId,
      scenario_id: scId,
      created_at: (new Date()),
      updated_at: (new Date())
    };
  });

  return Promise.resolve([files, newFiles])
    // Insert new files in the db.
    .then(allFiles => {
      let [oldFiles, newFiles] = allFiles;
      return trx.batchInsert('scenarios_files', newFiles).then(() => [oldFiles, newFiles]);
    })
    // Copy files on s3.
    .then(allFiles => {
      let [oldFiles, newFiles] = allFiles;
      return Promise.map(oldFiles, (old, i) => copyFile(old.path, newFiles[i].path));
    });
}

// Clone the osm-p2p-db.
function cloneOsmP2Pdb (srcProjId, srcScId, destProjId, destScId) {
  logger && logger.log('cloning osm-p2p-db');
  return cloneDatabase(srcProjId, srcScId, destProjId, destScId);
}

// TODO: Although some cleanup is good, if we delete the scenario altogether
// we won't have messages to show the user indicating that it failed.
// Figure out what's the best way to handle it.
//
// function onFailCleanup (projId, scId) {
//   return db
//     .delete()
//     .from('scenarios')
//     .where('id', scId)
//     .where('project_id', projId)
//     // Remove osm-p2p-db.
//     .then(() => removeDatabase(projId, scId))
//     // Remove files uploaded to s3.
//     .then(() => emptyBucket(bucket, `scenario-${scId}/`))
//     .catch(err => {
//       console.log('onFailCleanup error', err);
//     });
// }
