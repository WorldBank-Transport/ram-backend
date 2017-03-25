'use strict';
import path from 'path';
import { exec, fork } from 'child_process';
import fs from 'fs';
import async from 'async';

import { writeFile, getJSONFileContents } from './s3/utils';
import db from './db';
import config from './config';

const { PROJECT_ID: projId, SCENARIO_ID: scId } = process.env;
const WORK_DIR = path.resolve(__dirname, '../conversion', `p${projId}s${scId}`);

const DEBUG = config.debug;
const logger = AppLogger({ output: DEBUG });

try {
  fs.mkdirSync(WORK_DIR);
} catch (e) {
  if (e.code !== 'EEXIST') {
    throw e;
  }
}

logger.log('Max running processes set at', config.cpus);

//
// TODO Error handling: When one forked process fails everything has to be aborted.
//

// Start by loading the info on all the project and scenario files needed
// for the results processing.
fetchFilesInfo(projId, scId)
.then(files => {
  // Write files used by osm2osrm to disk.
  return Promise.all([
    writeFile(files.profile.path, `${WORK_DIR}/profile.lua`),
    writeFile(files['road-network'].path, `${WORK_DIR}/road-network.osm`)
  ])
  // Create orsm files and cleanup.
  .then(() => osm2osrm(WORK_DIR))
  .then(() => osm2osrmCleanup(WORK_DIR))
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
  return new Promise((resolve, reject) => {
    let time = Date.now();
    async.parallelLimit(timeMatrixTasks, config.cpus, (err, adminAreasCsv) => {
      logger.log('Processed ', timeMatrixTasks.length, 'admin areas in', (Date.now() - time) / 1000, 'seconds');
      if (err) return reject(err);
      return resolve(adminAreasCsv);
    });
  });
})
.then(adminAreasCsv => {
  logger.log('Writing result CSVs');
  adminAreasCsv.forEach(o => {
    let name = 'results--' + o.adminArea.name.replace(' ', '') + '.csv';
    fs.writeFileSync(`${WORK_DIR}/${name}`, o.csv);
  });

  logger.log('Done writing result CSVs');
})
.then(() => logger.toFile(`${WORK_DIR}/process.log`))
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
    logger.group('OSRM').log('Generation started');
    let osm2osrmTime = Date.now();
    let bin = path.resolve(__dirname, '../scripts/osm2osrm.sh');
    exec(`bash ${bin} -d ${dir}`, (error, stdout, stderr) => {
      logger.group('OSRM').log('Completed in', (Date.now() - osm2osrmTime) / 1000, 'seconds');
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

          cETA.disconnect();
          return callback(null, {
            adminArea: data.adminArea.properties,
            csv
          });
          // break;
      }
    });

    cETA.on('exit', (code) => {
      if (code !== 0) {
        let error = new Error('calculateETA exited with non 0 code');
        error.code = code;
        return callback(error);
      }
    });
  };
}

function AppLogger (options) {
  options = Object.assign({}, {
    output: false
  }, options);

  let chrono = [];
  let history = {
    main: []
  };

  const getLogTime = () => {
    let d = new Date();
    let h = d.getHours();
    h = h < 10 ? `0${h}` : h;
    let m = d.getMinutes();
    m = m < 10 ? `0${m}` : m;
    let s = d.getSeconds();
    s = s < 10 ? `0${s}` : s;
    let ml = d.getMilliseconds();
    ml = ml < 10 ? `00${ml}` : ml < 100 ? `0${ml}` : ml;
    return `${h}:${m}:${s}.${ml}`;
  };

  const _log = (group, ...args) => {
    if (!history[group]) history[group] = [];
    let t = getLogTime();
    history[group].push([`[${t}]`, ...args]);
    chrono.push([`[${t}]`, `[${group}]`, ...args]);
    options.output && console.log(`[${t}]`, `[${group}]`, ...args);
  };

  const _dump = (group) => {
    options.output && console.log('--- --- ---');
    options.output && console.log(`[${group}]`);
    options.output && history[group].forEach(o => console.log(...o));
    options.output && console.log('--- --- ---');
  };

  return {
    getLogTime,
    group: (name) => ({
      getLogTime,
      log: (...args) => _log(name, ...args),
      dump: () => _dump(name)
    }),
    log: (...args) => _log('main', ...args),
    dump: () => {
      options.output && chrono.forEach(o => console.log(...o));
    },
    dumpGroups: () => {
      Object.keys(history).forEach(g => _dump(g));
    },
    toFile: (path) => {
      let data = chrono.map(o => o.join(' ')).join('\n');
      fs.writeFileSync(path, data);
    }
  };
}
