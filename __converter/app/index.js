'use strict';
import path from 'path';
import { exec, fork } from 'child_process';
import fs from 'fs';

import { writeFile, getJSONFileContents } from './s3/utils';
import db from './db';

const { PROJECT_ID: projId, SCENARIO_ID: scId } = process.env;
const WORK_DIR = path.resolve(__dirname, '../conversion', `p${projId}s${scId}`);

try {
  fs.mkdirSync(WORK_DIR);
} catch (e) {
  if (e.code !== 'EEXIST') {
    throw e;
  }
}

//
// TODO Error handling: When one forked process fails everything has to be aborted.
//

// Start by loading the info on all the project and scenario files needed
// for the results processing.
fetchFilesInfo(projId, scId)
.then(files => {
  let osm2osrmTime = Date.now();
  // Write files used by osm2osrm to disk.
  return Promise.all([
    writeFile(files.profile.path, `${WORK_DIR}/profile.lua`),
    writeFile(files['road-network'].path, `${WORK_DIR}/road-network.osm`)
  ])
  // Create orsm files and cleanup.
  .then(() => osm2osrm(WORK_DIR))
  .then(() => osm2osrmCleanup(WORK_DIR))
  .then(() => {
    let calculationTime = (Date.now() - osm2osrmTime) / 1000;
    console.log('osm2osrm', calculationTime);
  })
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
  let [adminArea, villages, pois] = res;

  let areas = [
    adminArea.features.find(o => o.properties.name === 'Tobias Barreto'),
    adminArea.features.find(o => o.properties.name === 'Lagarto'),
    adminArea.features.find(o => o.properties.name === 'Estância'),
    adminArea.features.find(o => o.properties.name === 'Palmares')
  ];

  var timeMatrixTasks = areas.map(area => {
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

  // Note to self.
  // Since promises are executed as soon as they are created, the process is
  // spawned. There are some errors being thrown. Investigate!

  // return timeMatrixTasks[0];

  return Promise.all(timeMatrixTasks);
})
.then(adminAreasCsv => {
  adminAreasCsv.forEach(o => {
    let name = 'results--' + o.adminArea.name.replace(' ', '') + '.csv';
    fs.writeFileSync(`${WORK_DIR}/${name}`, o.csv);
  });
})
.then(() => process.exit(0))
.catch(err => {
  console.log('err', err);
  process.exit(1);
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

function osm2osrm (dir) {
  return new Promise((resolve, reject) => {
    let bin = path.resolve(__dirname, '../scripts/osm2osrm.sh');
    exec(`bash ${bin} -d ${dir}`, (error, stdout, stderr) => {
      if (error) return reject(stderr);
      return resolve(stdout);
    });
  });
}

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

function createTimeMatrixTask (data, osrmFile) {
  return new Promise((resolve, reject) => {
    console.log('here');
    let beginTime = Date.now();

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
    cETA.send(processData);
    cETA.on('message', function (msg) {
      switch (msg.type) {
        case 'squarecount':
          remainingSquares = msg.data;
          break;
        case 'square':
          remainingSquares--;
          // Emit status?
          break;
        case 'done':
          let calculationTime = (Date.now() - beginTime) / 1000;
          console.log('calculationTime', calculationTime);
          // Build csv file.
          let result = msg.data;
          let header = Object.keys(result[0]);
          // Ensure the row order is the same as the header.
          let rows = result.map(r => header.map(h => r[h]));

          // Convert to string
          let csv = header.join(',') + '\n';
          csv += rows.map(r => r.join(',')).join('\n');

          console.log('data.adminArea.properties', data.adminArea.properties.name);
          cETA.disconnect();
          return resolve({
            adminArea: data.adminArea.properties,
            csv
          });
          // fs.writeFileSync('results', file);
          break;
      }
    });

    cETA.on('exit', (code) => {
      // if (code !== 0) {
      //   let error = new Error('calculateETA exited with non 0 code');
      //   error.code = code;
      //   return reject(error);
      // }
    });
  });
}
