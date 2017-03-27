'use strict';
import path from 'path';
import { exec, fork } from 'child_process';
import fs from 'fs';
import async from 'async';

import config from './config';
import { writeFile, getJSONFileContents, putFile } from './s3/utils';
import db from './db';
import Operation from './utils/operation';
import AppLogger from './utils/app-logger';
import * as op from './utils/operation-codes';

const { PROJECT_ID: projId, SCENARIO_ID: scId, CONVERSION_DIR: conversion_dir } = process.env;
const WORK_DIR = path.resolve(conversion_dir, `p${projId}s${scId}`);

const DEBUG = config.debug;
const logger = AppLogger({ output: DEBUG });
const operation = new Operation(db);

try {
  fs.mkdirSync(WORK_DIR);
} catch (e) {
  if (e.code !== 'EEXIST') {
    throw e;
  }
}

logger.log('Max running processes set at', config.cpus);

operation.start('generate-analysis', projId, scId)
// Start by loading the info on all the project and scenario files needed
// for the results processing.
.then(() => fetchFilesInfo(projId, scId))
.then(files => {
  // Write files used by osm2osrm to disk.
  return Promise.all([
    writeFile(files.profile.path, `${WORK_DIR}/profile.lua`),
    writeFile(files['road-network'].path, `${WORK_DIR}/road-network.osm`)
  ])
  .then(() => operation.log(op.OP_OSRM, {message: 'osm2osrm processing started'}))
  // Create orsm files and cleanup.
  .then(() => osm2osrm(WORK_DIR))
  .then(() => osm2osrmCleanup(WORK_DIR))
  .then(() => operation.log(op.OP_OSRM, {message: 'osm2osrm processing finished'}))
  // Pass the files for the next step.
  .then(() => files);
})
// Load the other needed files.
.then(files => Promise.all([
  getJSONFileContents(files['admin-bounds'].path),
  getJSONFileContents(files.villages.path),
  getJSONFileContents(files.poi.path)
]))
.then(res => {
  let [adminAreas, villages, pois] = res;

  // Cleanup
  let adminAreasFeat = adminAreas.features.filter((o, i) => {
    if (o.geometry.type === 'Point') {
      let id = o.properties.name ? `name: ${o.properties.name}` : `idx: ${i}`;
      logger.log('Feature is a Point -', id, '- skipping');
      return false;
    }
    if (!o.properties.name) {
      logger.log('Feature without name', `idx: ${i}`, '- skipping');
      return false;
    }
    return true;
  });

  var timeMatrixTasks = adminAreasFeat.map(area => {
    const data = {
      adminArea: area,
      villages: villages,
      pois: {
        townhall: pois
      },
      maxSpeed: 120,
      maxTime: 3600
    };
    return createTimeMatrixTask(data, `${WORK_DIR}/road-network.osrm`);
  });

  // createTimeMatrixTask need to be executed in parallel with a limit because
  // they spawn new processes. Use async but Promisify to continue chain.
  let timeMatrixRunner = new Promise((resolve, reject) => {
    let time = Date.now();
    async.parallelLimit(timeMatrixTasks, config.cpus, (err, adminAreasCsv) => {
      if (err) return reject(err);
      logger.log('Processed ', timeMatrixTasks.length, 'admin areas in', (Date.now() - time) / 1000, 'seconds');
      return resolve(adminAreasCsv);
    });
  });

  return operation.log(op.OP_ROUTING, {message: 'Routing started', count: timeMatrixTasks.length})
    .then(() => timeMatrixRunner)
    .then((adminAreasCsv) => operation.log(op.OP_ROUTING, {message: 'Routing complete'}).then(() => adminAreasCsv));
})
// S3 storage.
.then(adminAreasCsv => {
  logger.group('s3').log('Storing files');
  let putFilesTasks = adminAreasCsv.map(o => saveScenarioFile(o, projId, scId));

  return operation.log(op.OP_RESULTS, {message: 'Storing results'})
    .then(() => Promise.all(putFilesTasks))
    .then(() => operation.log(op.OP_RESULTS, {message: 'Storing results complete'}))
    .then(() => {
      logger.group('s3').log('Storing files complete');
      // Pass it along.
      return adminAreasCsv;
    });
})
// File storage
.then(adminAreasCsv => {
  logger.log('Writing result CSVs');
  adminAreasCsv.forEach(o => {
    let name = 'results--' + o.adminArea.name.replace(' ', '') + '.csv';
    fs.writeFileSync(`${WORK_DIR}/${name}`, o.csv);
  });

  logger.log('Done writing result CSVs');
})
.then(() => operation.log(3, {message: 'Files written'}))
.then(() => operation.finish())
.then(() => logger.toFile(`${WORK_DIR}/process.log`))
.then(() => process.exit(0))
.catch(err => {
  console.log('err', err);
  operation.log(op.ERROR, {error: err})
    .then(() => operation.finish())
    .then(() => process.exit(1), () => process.exit(1));
});

function fetchFilesInfo (projId, scId) {
  return Promise.all([
    db('projects_files')
      .select('*')
      .whereIn('type', ['profile', 'villages', 'admin-bounds'])
      .where('project_id', projId),
    db('scenarios_files')
      .select('*')
      .whereIn('type', ['poi', 'road-network'])
      .where('project_id', projId)
      .where('scenario_id', scId)
  ])
  .then(files => {
    // Merge scenario and project files and convert the files array
    // into an object indexed by type.
    let obj = {};
    files
      .reduce((acc, f) => acc.concat(f), [])
      .forEach(o => (obj[o.type] = o));
    return obj;
  });
}

/**
 * Runs the osm 2 osrm conversion.
 * Calls a bash script with all the instruction located at
 * ../scripts/osm2osrm.sh
 * @param  {string} dir Directory where the needed files are.
 *                      Expects a profile.lua and a road-network.osm
 * @return {Promise}
 */
function osm2osrm (dir) {
  return new Promise((resolve, reject) => {
    logger.group('OSRM').log('Generation started');
    let osm2osrmTime = Date.now();
    let bin = path.resolve(__dirname, '../scripts/osm2osrm.sh');
    exec(`bash ${bin} -d ${dir}`, (error, stdout, stderr) => {
      if (error) return reject(stderr);
      logger.group('OSRM').log('Completed in', (Date.now() - osm2osrmTime) / 1000, 'seconds');
      return resolve(stdout);
    });
  });
}

/**
 * Cleanup after the osm2osrm.
 * @param  {string} dir Directory where the files are.
 * @return {Promise}
 */
function osm2osrmCleanup (dir) {
  return new Promise((resolve, reject) => {
    let globs = [
      'road-network.osm',
      // 'road-network.osrm.*',
      'stxxl*',
      '.stxxl',
      'profile.lua',
      'lib'
    ].map(g => `${dir}/${g}`).join(' ');

    exec(`rm ${globs}`, (error, stdout, stderr) => {
      if (error) return reject(stderr);
      return resolve(stdout);
    });
  });
}

// Store all the created processes.
let runningProcesses = [];

function createTimeMatrixTask (data, osrmFile) {
  return (callback) => {
    const taskLogger = logger.group(data.adminArea.properties.name);
    const beginTime = Date.now();
    let processData = {
      id: 2,
      poi: data.pois,
      gridSize: 30,
      villages: data.villages,
      osrmFile: osrmFile,
      maxTime: data.maxTime,
      maxSpeed: data.maxSpeed,
      adminArea: data.adminArea
    };
    let remainingSquares = null;

    const cETA = fork(path.resolve(__dirname, 'calculateETA.js'));
    runningProcesses.push(cETA);

    cETA.send(processData);
    cETA.on('message', function (msg) {
      switch (msg.type) {
        case 'debug':
          taskLogger.log('debug', msg.data);
          break;
        case 'status':
          taskLogger.log('status', msg.data);
          break;
        case 'squarecount':
          remainingSquares = msg.data;
          taskLogger.log('total squares', msg.data);
          break;
        case 'square':
          remainingSquares--;
          taskLogger.log('square processed', msg.data, 'Remaining', remainingSquares);
          // Emit status?
          break;
        case 'done':
          let calculationTime = (Date.now() - beginTime) / 1000;
          taskLogger.log('Total routing time', calculationTime);
          // Build csv file.
          let result = msg.data;

          if (!result.length) {
            // Result may be empty if in the work area there are no villages.
            taskLogger.log('No results returned');
            return callback(null, {
              adminArea: data.adminArea.properties,
              csv: 'error\nThere are no results for this admin area'
            });
          }
          taskLogger.log(`Results returned for ${result.length} villages`);

          let header = Object.keys(result[0]);
          // Ensure the row order is the same as the header.
          let rows = result.map(r => header.map(h => r[h]));

          // Convert to string
          let csv = header.join(',') + '\n';
          csv += rows.map(r => r.join(',')).join('\n');

          const finish = () => {
            cETA.disconnect();
            return callback(null, {
              adminArea: data.adminArea.properties,
              csv
            });
          };

          // Error or not, we finish the process.
          operation.log(op.OP_ROUTING_AREA, {message: 'Routing complete', adminArea: data.adminArea.properties.name})
            .then(() => finish(), () => finish());

          // break;
      }
    });

    cETA.on('exit', (code) => {
      if (code !== 0) {
        // Stop everything if one of the processes errors.
        runningProcesses.forEach(p => p.kill());
        let error = new Error('calculateETA exited with non 0 code');
        error.code = code;
        return callback(error);
      }
    });
  };
}

/**
 * Stores a scenario file to the storage engine and updates the database.
 * @param  {object} data   Object with data to store and admin area properties.
 * @param  {number} projId Project id.
 * @param  {number} scId   Scenario id.
 * @return {Promise}
 */
function saveScenarioFile (data, projId, scId) {
  const fileName = `results_${data.adminArea.name.replace(' ', '')}_${Date.now()}`;
  const filePath = `scenario-${scId}/${fileName}`;
  const fileData = {
    name: fileName,
    type: 'results',
    path: filePath,
    project_id: projId,
    scenario_id: scId,
    created_at: (new Date()),
    updated_at: (new Date())
  };

  logger.group('s3').log('Saving file', filePath);

  return putFile(filePath, data.csv)
    .then(() => db('scenarios_files')
      .returning('*')
      .insert(fileData)
      .then(() => db('projects')
        .update({
          updated_at: (new Date())
        })
        .where('id', projId)
      )
    );
}
