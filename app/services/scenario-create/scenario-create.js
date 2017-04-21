'use strict';
import fs from 'fs';
import os from 'os';
import cp from 'child_process';
import path from 'path';
import Promise from 'bluebird';
import osm2json from 'osm2json';
import putChanges from 'osm-p2p-server/api/put_changes';
import createChangeset from 'osm-p2p-server/api/create_changeset';
import osmP2PErrors from 'osm-p2p-server/errors';

import config from '../../config';
import { cloneDatabase, getDatabase } from '../rra-osm-p2p';
import db from '../../db/';
import { copyFile, getFileContents } from '../../s3/utils';
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
 * Creates a new scenario by cloning the needed files. Depending on the source
 * it either copies the osm-p2p-db from the source scenario, or creates a new
 * one importing the road data from the file.
 *
 * @param  {object} e       Data.
 *         e.opId           Operation Id. It has to be already started.
 *         e.projId         Project Id.
 *         e.scId           Scenario Id.
 *         e.source         Source for the road network (clone | new)
 *         e.sourceScenarioId  Id of the source scenario. Relevant if source
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
    source,
    sourceScenarioId,
    roadNetworkFile,
    callback
  } = e;

  let op = new Operation(db);
  op.loadById(opId)
    .then(op => op.log('admin-areas', {message: 'Cloning admin areas'}))
    .then(() => db.transaction(function (trx) {
      // Get the admin areas from the master scenario.
      let executor = trx('scenarios')
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
        );

      if (source === 'clone') {
        executor = executor
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
          .then(() => cloneOsmP2Pdb(projId, sourceScenarioId, projId, scId));
      //
      } else if (source === 'new') {
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
          .then(roadNetwork => processRoadNetwork(projId, scId, op, roadNetwork));
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

function processRoadNetwork (projId, scId, op, roadNetwork) {
  logger && logger.log('process road network');
  console.time('processRoadNetwork');
  const db = getDatabase(projId, scId);
  const basePath = path.resolve(os.tmpdir(), `road-networkP${projId}S${scId}`);

  // Create a new changeset through the API.
  const generateChangeset = () => {
    return new Promise((resolve, reject) => {
      let changeset = {
        type: 'changeset',
        tags: {
          comment: `Finish project setup. Project ${projId}, Scenario ${scId}`,
          created_by: 'RRA'
        }
      };
      createChangeset(db)(changeset, (err, id, node) => {
        if (err) return reject(err);
        return resolve(id);
      });
    });
  };

  // Create an OSM Change file and store it in system /tmp folder.
  const createOSMChange = (id) => {
    return new Promise((resolve, reject) => {
      // OGR reads from a file
      fs.writeFileSync(`${basePath}.osm`, roadNetwork);

      // Use ogr2osm with:
      // -t - a custom translation file. Default only removes empty values
      // -o - to specify output file
      // -f - to force overwrite
      let cmd = path.resolve(__dirname, '../../lib/ogr2osm/ogr2osm.py');
      let args = [
        cmd,
        `${basePath}.osm`,
        '-t', './app/lib/ogr2osm/default_translation.py',
        '--changeset-id', id,
        '-o', `${basePath}.osmc`,
        '-f'
      ];

      let conversionProcess = cp.spawn('python', args);
      let processError = '';
      conversionProcess.stderr.on('data', err => {
        processError += err.toString();
      });
      conversionProcess.on('close', code => {
        if (code !== 0) {
          let err = processError || `Unknown error. Code ${code}`;
          return reject(new Error(err));
        }
        return resolve(id);
      });
    });
  };

  // Add data from the OSM Change file to the created changeset.
  const putChangeset = (id) => {
    return new Promise((resolve, reject) => {
      let changes = osm2json({coerceIds: false}).parse(fs.readFileSync(`${basePath}.osmc`));
      if (!changes.length) return reject(new osmP2PErrors.XmlParseError());

      putChanges(db)(changes, id, (err, diffResult) => {
        console.timeEnd('processRoadNetwork');
        if (err) return reject(err);
        return resolve();
      });
    });
  };

  return op.log('process:road-network', {message: 'Road network processing started'})
    .then(() => generateChangeset())
    .then(id => createOSMChange(id))
    .then(id => putChangeset(id))
    // Note: There's no need to close the osm-p2p-db because when the process
    // terminates the connection is automatically closed.
    .then(() => op.log('process:road-network', {message: 'Road network processing finished'}));
}
