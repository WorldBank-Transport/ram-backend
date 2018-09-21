'use strict';
import path from 'path';
import Promise from 'bluebird';
import centerOfMass from '@turf/center-of-mass';

import config from '../../config';
import { cloneDatabase, closeDatabase, importRoadNetwork, importPOI } from '../rra-osm-p2p';
import db from '../../db/';
import { setScenarioSetting, getScenarioSetting } from '../../utils/utils';
import { copyFile, copyDirectory, putFileStream, getFileContents, getJSONFileContents, getFileInfo } from '../../s3/utils';
import Operation from '../../utils/operation';
import AppLogger from '../../utils/app-logger';
import * as overpass from '../../utils/overpass';
import { createRoadNetworkVT } from '../../utils/vector-tiles';
import { downloadWbCatalogScenarioFile } from '../../utils/wbcatalog';

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
    poiSource,
    poiSourceScenarioId,
    rnSourceWbCatalogOption,
    callback
  } = e;

  let op = new Operation(db);
  op.loadById(opId)
    .then(op => op.log('admin-areas', {message: 'Cloning admin areas'}))
    .then(() => {
      let executor = Promise.resolve();

      logger && logger.log('poiSource', poiSource);
      logger && logger.log('rnSource', rnSource);

      if (poiSource === 'clone') {
        executor = executor
          // Copy the scenario files.
          .then(() => op.log('files', {message: 'Cloning points of interest'}))
          .then(() => db('scenarios_files')
            .select('*')
            .where('scenario_id', poiSourceScenarioId)
            .where('project_id', projId)
            .where('type', 'poi')
            .then(files => cloneScenarioFiles(db, files, projId, scId))
          )
          // Set poi source to file.
          .then(() => db('scenarios_source_data')
            .insert({
              project_id: projId,
              scenario_id: scId,
              name: 'poi',
              type: 'file'
            })
          );
      } else {
        throw new Error(`Poi source is invalid: ${poiSource}`);
      }

      const settingsAndVtProcess = ([filePath, fileInfo]) => {
        // Disable road network editing if size over threshold.
        let allowImport = fileInfo.size < config.roadNetEditMax;
        return setScenarioSetting(db, scId, 'rn_active_editing', allowImport)
          .then(() => {
            if (process.env.DS_ENV !== 'test') {
              logger && logger.log('process road network');
              return createRoadNetworkVT(projId, scId, op, filePath).promise;
            }
          });
      };

      // Road Network: Clone.
      if (rnSource === 'clone') {
        executor = executor
          // Copy the scenario files.
          .then(() => op.log('files', {message: 'Cloning road network'}))
          .then(() => db('scenarios_files')
            .select('*')
            .where('scenario_id', rnSourceScenarioId)
            .where('project_id', projId)
            .where('type', 'road-network')
            .then(files => cloneScenarioFiles(db, files, projId, scId))
          )
          // Set road network source to file.
          .then(() => db('scenarios_source_data')
            .insert({
              project_id: projId,
              scenario_id: scId,
              name: 'road-network',
              type: 'file'
            })
          )
          // Copy the setting for road network edition.
          .then(() => db('scenarios_settings')
            .select('value')
            .where('scenario_id', rnSourceScenarioId)
            .where('key', 'rn_active_editing')
            .first()
            .then(res => setScenarioSetting(db, scId, 'rn_active_editing', res ? res.value : false))
          )
          // Copy vector tiles.
          .then(() => copyDirectory(`scenario-${rnSourceScenarioId}/tiles/road-network`, `scenario-${scId}/tiles/road-network`));

      // Road Network: New
      } else if (rnSource === 'new') {
        executor = executor
          .then(() => op.log('files', {message: 'Uploading new road network'}))
          // Set road network source to file.
          .then(() => db('scenarios_source_data')
            .insert({
              project_id: projId,
              scenario_id: scId,
              name: 'road-network',
              type: 'file'
            })
          )
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

            return db('scenarios_files')
              .returning('*')
              .insert(data)
              .then(() => data);
          })
          .then(file => Promise.all([file.path, getFileInfo(file.path)]))
          .then(settingsAndVtProcess);

      // Road Network: Osm
      } else if (rnSource === 'osm') {
        executor = executor
          .then(() => op.log('files', {message: 'Importing road network'}))
          // Set road network source to osm.
          .then(() => db('scenarios_source_data')
            .insert({
              project_id: projId,
              scenario_id: scId,
              name: 'road-network',
              type: 'osm'
            })
          )
          // Get the bbox for the overpass import.
          .then(() => db('projects')
            .select('bbox')
            .where('id', projId)
            .first()
            .then(res => res.bbox)
          )
          .then(bbox => overpass.importRoadNetwork(overpass.convertBbox(bbox)))
          // Just to log error
          .catch(err => {
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
              .then(() => data);
          })
          .then(file => Promise.all([file.path, getFileInfo(file.path)]))
          .then(settingsAndVtProcess);

      // Road Network: WB Catalog
      } else if (rnSource === 'wbcatalog') {
        executor = executor
          .then(() => op.log('files', {message: 'Downloading road network'}))
          // Set road network source to osm.
          .then(() => {
            const data = {
              project_id: projId,
              scenario_id: scId,
              name: 'road-network',
              type: 'wbcatalog',
              // See scenario--source-data.js about this structure.
              data: JSON.stringify({ resources: [{ key: rnSourceWbCatalogOption }] })
            };
            return db('scenarios_source_data')
              .returning('*')
              .insert(data)
              .then(res => res[0]);
          })
          .then(source => downloadWbCatalogScenarioFile(projId, scId, source, logger))
          .then(file => Promise.all([file.path, getFileInfo(file.path)]))
          .then(settingsAndVtProcess);
      } else {
        throw new Error(`Road network source is invalid: ${rnSource}`);
      }

      // If we're cloning both the pois and the rn from the same source
      // we can just clone the database. There's no need to import.
      if (rnSource === 'clone' && poiSource === 'clone' && rnSourceScenarioId === poiSourceScenarioId) {
        logger && logger.log('Cloning from same source. Duplicating osm db.');
        executor = executor
          // Copy the osm-p2p-db.
          .then(() => op.log('files', {message: 'Cloning osm database'}))
          .then(() => closeDatabase(projId, scId))
          .then(() => cloneOsmP2Pdb(projId, rnSourceScenarioId, projId, scId));
      } else {
        // Is there any importing to do?
        executor = executor
          .then(() => getScenarioSetting(db, scId, 'rn_active_editing'))
          // No import. Stop the chain with an error.
          .then(editing => {
            if (!editing) {
              logger && logger.log('Road network editing inactive.');
              throw new Error('not editing');
            }
          })
          // Get the road network from the db.
          .then(() => db('scenarios_files')
            .select('*')
            .where('project_id', projId)
            .where('scenario_id', scId)
            .where('type', 'road-network')
            .first()
            .then(file => getFileContents(file.path))
          )
          // Import into osm db.
          .then(roadNetwork => {
            let rnLogger = appLogger.group(`p${projId} s${scId} rn import`);
            rnLogger && rnLogger.log('process road network');
            return importRoadNetwork(projId, scId, op, roadNetwork, rnLogger);
          })
          // Get all the pois and create a feature collection.
          .then(() => db('scenarios_files')
            .select('*')
            .where('project_id', projId)
            .where('scenario_id', scId)
            .where('type', 'poi')
            .then(files => Promise.all([
              files,
              Promise.map(files, file => getJSONFileContents(file.path))
            ]))
            .then(([files, filesContent]) => {
              // Merge all feature collection together.
              // Add a property to keep track of the poi type.
              return {
                type: 'FeatureCollection',
                features: files.reduce((acc, file, idx) => {
                  const key = file.subtype;
                  const features = filesContent[idx].features.map(feat => {
                    return {
                      ...feat,
                      properties: {
                        ...feat.properties,
                        ram_poi_type: key
                      },
                      geometry: feat.geometry.type !== 'Point'
                        ? centerOfMass(feat).geometry
                        : feat.geometry
                    };
                  });
                  return acc.concat(features);
                }, [])
              };
            })
          )
          // Import into osm db.
          .then(poiFc => {
            let poiLogger = appLogger.group(`p${projId} s${scId} poi import`);
            poiLogger && poiLogger.log('process poi');
            return importPOI(projId, scId, op, poiFc, poiLogger);
          })
          // Ignore not editing error.
          .catch(e => { if (e.message !== 'not editing') throw e; });
      }

      return executor
        .then(() => db('scenarios').update({status: 'active', updated_at: (new Date())}).where('id', scId))
        .then(() => db('projects').update({updated_at: (new Date())}).where('id', projId))
        .then(() => op.log('success', {message: 'Operation complete'}).then(op => op.finish()));
    })
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
function cloneScenarioFiles (db, files, projId, scId) {
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
      return db.batchInsert('scenarios_files', newFiles).then(() => [oldFiles, newFiles]);
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
