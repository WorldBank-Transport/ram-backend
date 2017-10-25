'use strict';
import path from 'path';
import Promise from 'bluebird';

import config from '../../config';
import { cloneDatabase, closeDatabase, importRoadNetwork } from '../rra-osm-p2p';
import db from '../../db/';
import { setScenarioSetting } from '../../utils/utils';
import { copyFile, copyDirectory, putFileStream, getFileContents } from '../../s3/utils';
import Operation from '../../utils/operation';
import AppLogger from '../../utils/app-logger';
import * as overpass from '../../utils/overpass';
import { createRoadNetworkVT } from '../../utils/vector-tiles';

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
 * Creates a new scenario by cloning the needed files. Depending on the source
 * it either copies the osm-p2p-db from the source scenario, or creates a new
 * one importing the road data from the file.
 *
 * @param  {object} e       Data.
 *         e.opId           Operation Id. It has to be already started.
 *         e.projId         Project Id.
 *         e.scId           Scenario Id.
 *         e.rnSource         Source for the road network (clone | new)
 *         e.rnSourceScenarioId  Id of the source scenario. Relevant if source
 *                             is `clone`.
 *         e.roadNetworkFile   Name of the road network file on s3. Relevant if
 *                             source is `new`.
 *         e.callback
 */
export function scenarioCreate (e) {
  const {
    projId,
    scId,
    opId,
    rnSource,
    rnSourceScenarioId,
    roadNetworkFile,
    callback
  } = e;

  let op = new Operation(db);
  op.loadById(opId)
    .then(op => op.log('admin-areas', {message: 'Cloning admin areas'}))
    .then(() => db.transaction(function (trx) {
      let executor = Promise.resolve();

      if (rnSource === 'clone') {
        executor = executor
          // Copy the scenario files.
          .then(() => op.log('files', {message: 'Cloning files'}))
          .then(() => trx('scenarios_files')
            .select('*')
            .where('scenario_id', rnSourceScenarioId)
            .where('project_id', projId)
            .whereIn('type', ['poi', 'road-network'])
            .then(files => cloneScenarioFiles(trx, files, projId, scId))
          )
          .then(() => trx('scenarios_source_data')
            .select('project_id', 'name', 'type', 'data')
            .where('scenario_id', rnSourceScenarioId)
            .where('project_id', projId)
            .then(sourceData => {
              // Set new id.
              sourceData.forEach(o => {
                o.scenario_id = scId;
              });
              return sourceData;
            })
          )
          .then(sourceData => trx.batchInsert('scenarios_source_data', sourceData))
          // Copy the setting for road network edition.
          .then(() => trx('scenarios_settings')
            .select('value')
            .where('scenario_id', rnSourceScenarioId)
            .where('key', 'rn_active_editing')
            .first()
            .then(res => setScenarioSetting(db, scId, 'rn_active_editing', res ? res.value : false))
          )
          // Copy the osm-p2p-db.
          .then(() => op.log('files', {message: 'Cloning road network database'}))
          .then(() => closeDatabase(projId, scId))
          .then(() => cloneOsmP2Pdb(projId, rnSourceScenarioId, projId, scId))
          .then(() => copyDirectory(`scenario-${rnSourceScenarioId}/tiles/road-network`, `scenario-${scId}/tiles/road-network`));
      //
      } else if (rnSource === 'new') {
        executor = executor
          // Copy the scenario files.
          .then(() => op.log('files', {message: 'Cloning files'}))
          // When uploading a new file we do so only for the
          // road-network. Since the poi file is identical for all
          // scenarios of the project just clone it from the master.
          .then(() => trx('scenarios_files')
            .select('scenarios_files.*')
            .innerJoin('scenarios', 'scenarios.id', 'scenarios_files.scenario_id')
            .where('scenarios.master', true)
            .where('scenarios.project_id', projId)
            .where('scenarios_files.type', 'poi')
            .then(files => cloneScenarioFiles(trx, files, projId, scId))
          )
          // Insert source info.
          // TODO: This needs to be updated once we have osm data.
          .then(() => trx.batchInsert('scenarios_source_data', [
            {
              project_id: projId,
              scenario_id: scId,
              name: 'road-network',
              type: 'file'
            },
            {
              project_id: projId,
              scenario_id: scId,
              name: 'poi',
              type: 'file'
            }
          ]))
          // Add entry for road network file.
          .then(() => {
            let now = new Date();
            let data = {
              name: roadNetworkFile,
              type: 'road-network',
              path: `scenario-${scId}/${roadNetworkFile}`,
              project_id: projId,
              scenario_id: scId,
              created_at: now,
              updated_at: now
            };

            return trx('scenarios_files')
              .returning('*')
              .insert(data)
              .then(res => res[0]);
          })
          .then(file => getFileContents(file.path))
          // Import to the osm-p2p-db.
          .then(roadNetwork => {
            logger && logger.log('process road network');
            return importRoadNetworkOsmP2Pdb(projId, scId, op, roadNetwork)
              .then(roadNetwork => createRoadNetworkVT(projId, scId, op, roadNetwork).promise);
          });
      } else if (rnSource === 'osm') {
        executor = executor
          .then(() => op.log('files', {message: 'Importing road network'}))
          .then(() => trx.batchInsert('scenarios_source_data', [
            {
              project_id: projId,
              scenario_id: scId,
              name: 'road-network',
              type: 'osm'
            },
            {
              project_id: projId,
              scenario_id: scId,
              name: 'poi',
              type: 'file'
            }
          ]))
          // When uploading a new file we do so only for the
          // road-network. Since the poi file is identical for all
          // scenarios of the project just clone it from the master.
          .then(() => trx('scenarios_files')
            .select('scenarios_files.*')
            .innerJoin('scenarios', 'scenarios.id', 'scenarios_files.scenario_id')
            .where('scenarios.master', true)
            .where('scenarios.project_id', projId)
            .where('scenarios_files.type', 'poi')
            .then(files => cloneScenarioFiles(trx, files, projId, scId))
          )
          // Get the bbox for the overpass import.
          .then(() => db('projects')
            .select('bbox')
            .where('id', projId)
            .first()
            .then(res => res.bbox)
          )
          .then(bbox => overpass.importRoadNetwork(overpass.convertBbox(bbox)))
          .catch(err => {
            // Just to log error
            logger && logger.log('Error importing from overpass', err.message);
            throw err;
          })
          .then(osmData => {
            // Insert file into DB.
            let fileName = `road-network_${Date.now()}`;
            let filePath = `scenario-${scId}/${fileName}`;
            let data = {
              name: fileName,
              type: 'road-network',
              path: filePath,
              project_id: projId,
              scenario_id: scId,
              created_at: (new Date()),
              updated_at: (new Date())
            };

            return putFileStream(filePath, osmData)
              .then(() => db('scenarios_files').insert(data))
              .then(() => {
                logger && logger.log('process road network');
                return importRoadNetworkOsmP2Pdb(projId, scId, op, osmData)
                  .then(roadNetwork => createRoadNetworkVT(projId, scId, op, roadNetwork).promise);
              });
          });
      }

      return executor
        .then(() => trx('scenarios').update({status: 'active', updated_at: (new Date())}).where('id', scId))
        .then(() => trx('projects').update({updated_at: (new Date())}).where('id', projId))
        .then(() => op.log('success', {message: 'Operation complete'}).then(op => op.finish()));
    }))
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
    const fileName = file.type === 'poi'
      ? `${file.type}_${file.subtype}_${Date.now()}`
      : `${file.type}_${Date.now()}`;

    const filePath = `scenario-${scId}/${fileName}`;

    return {
      name: fileName,
      type: file.type,
      subtype: file.subtype,
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
  return cloneDatabase(srcProjId, srcScId, destProjId, destScId)
    .catch(err => {
      // If the road network is too big, the db is not created.
      // Account for this and avoid errors.
      // TODO: Check if the DB is supposed to not exist.
      if (err.code !== 'ENOENT') {
        throw err;
      }
    });
}

function importRoadNetworkOsmP2Pdb (projId, scId, op, roadNetwork) {
  let rnLogger = appLogger.group(`p${projId} s${scId} rn import`);
  rnLogger && rnLogger.log('process road network');

  // Disable road network editing if size over threshold.
  let allowImport = roadNetwork.length < config.roadNetEditMax;

  return setScenarioSetting(db, scId, 'rn_active_editing', allowImport)
    .then(() => {
      if (allowImport) {
        return importRoadNetwork(projId, scId, op, roadNetwork, rnLogger);
      }
    })
    .then(() => roadNetwork);
}
