/* eslint-disable */
'use strict';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import tmpDir from 'temp-dir';
import Promise from 'bluebird';

import config from '../config';

import {
  removeDir as removeS3Dir,
  putDirectory,
  fGetFile
} from '../s3/utils';

const DEBUG = config.debug;

/**
 * Create the vector tiles for the admin bounds.
 * Full process:
 * - Clean up local folders
 * - Clean up remote storage
 * - Write geojson file to disk
 * - Convert geojson to vector tiles
 * - Upload vector-tiles to remote storage
 *
 * @param  {int} projId
 * @param  {int} scId
 * @param  {Operation} op
 * @param  {String} roadNetwork
 *
 * @return Object with a `promise` and a `kill` switch.
 */
export function createAdminBoundsVT (projId, scId, op, fc) {
  // Temporary disable vector tiles.
  return {
    promise: Promise.resolve(),
    kill: () => Promise.resolve()
  };

  const identifier = `p${projId} s${scId} AB VT`;

  // Promisify functions.
  const removeP = Promise.promisify(fs.remove);
  const writeJsonP = Promise.promisify(fs.writeJson);

  const geojsonName = `p${projId}s${scId}-fc.geojson`;
  const tilesFolderName = `p${projId}s${scId}-tiles`;
  const geojsonFilePath = path.resolve(tmpDir, geojsonName);
  const tilesFolderPath = path.resolve(tmpDir, tilesFolderName);

  let currentRunning = null;
  let killed = false;
  let checkKilled = () => { if (killed) throw new Error('Process manually terminated'); };

  DEBUG && console.log(identifier, 'Clean files...');

  // Clean any existing files, locally and from S3.
  let executor = op.log('process:admin-bounds', {message: 'Creating admin bounds vector tiles'})
    // Clean up phase.
    .then(() => Promise.all([
      removeP(geojsonFilePath),
      removeP(tilesFolderPath),
      // Admin bounds tiles are calculated during project setup, meaning that
      // there won't be anything on S3. This is just in case the process fails
      // down the road and we've to repeat.
      removeS3Dir(`project-${projId}/tiles/admin-bounds`)
    ]))
    .then(() => { DEBUG && console.log(identifier, 'Clean files... done'); })
    .then(() => writeJsonP(geojsonFilePath, fc))
    // Check if it was killed. The docker run will throw errors but the other
    // processes won't. Stop the chain if it was aborted before reaching
    // docker run
    .then(() => checkKilled())
    // Create tiles.
    .then(() => {
      DEBUG && console.log(identifier, 'Running tippecanoe...');
      currentRunning = `p${projId}s${scId}-bounds`;
      return dockerRun([
        `-v ${tmpDir}:/data`,
        `--name ${currentRunning}`,
        'wbtransport/rra-vt',
        'tippecanoe',
        '-l bounds',
        `-e /data/${tilesFolderName}`,
        `/data/${geojsonName}`
      ]);
    })
    .then(() => { DEBUG && console.log(identifier, 'Running tippecanoe... done'); })
    // Check if it was killed. Additional check in case docker delayed in
    // throwing the error.
    .then(() => checkKilled())
    .then(() => { DEBUG && console.log(identifier, 'Uploading to storage...'); })
    .then(() => putDirectory(tilesFolderPath, `project-${projId}/tiles/admin-bounds`))
    .then(() => { DEBUG && console.log(identifier, 'Uploading to storage... done'); })
    // Check if it was killed. putDirectory will not throw an error so stop the
    // run if the analysis was killed while putDirectory was running.
    .then(() => checkKilled());

  return {
    promise: executor,
    kill: () => {
      killed = true;
      return currentRunning
        ? dockerKill(currentRunning)
          .then(() => { currentRunning = null; })
        : Promise.resolve();
    }
  };
}

/**
 * Create the vector tiles for the road network.
 * Full process:
 * - Clean up local folders
 * - Clean up remote storage
 * - Write osm file to disk
 * - Convert osm to geojson
 * - Convert geojson to vector tiles
 * - Upload vector-tiles to remote storage
 *
 * @param  {int} projId
 * @param  {int} scId
 * @param  {Operation} op
 * @param  {String} roadNetworkPath
 *
 * @return Object with a `promise` and a `kill` switch.
 */
export function createRoadNetworkVT (projId, scId, op, roadNetworkPath) {
  // Temporary disable vector tiles.
  return {
    promise: Promise.resolve(),
    kill: () => Promise.resolve()
  };

  const identifier = `p${projId} s${scId} RN VT`;

  // Promisify functions.
  const removeP = Promise.promisify(fs.remove);

  const osmName = `p${projId}s${scId}-rn.osm`;
  const geojsonName = `p${projId}s${scId}-rn.geojson`;
  const tilesFolderName = `p${projId}s${scId}-rn-tiles`;
  const osmFilePath = path.resolve(tmpDir, osmName);
  const geojsonFilePath = path.resolve(tmpDir, geojsonName);
  const tilesFolderPath = path.resolve(tmpDir, tilesFolderName);

  let currentRunning = null;
  let killed = false;
  let checkKilled = () => { if (killed) throw new Error('Process manually terminated'); };

  DEBUG && console.log(identifier, 'Clean files...');

  // Clean any existing files, locally and from S3.
  let executor = op.log('road-network', {message: 'Creating road-network vector tiles'})
    // Clean up phase.
    .then(() => Promise.all([
      removeP(osmFilePath),
      removeP(geojsonFilePath),
      removeP(tilesFolderPath),
      // Clean S3 directory
      removeS3Dir(`scenario-${scId}/tiles/road-network`)
    ]))
    .then(() => { DEBUG && console.log(identifier, 'Clean files... done'); })
    .then(() => fGetFile(roadNetworkPath, osmFilePath))
    // Check if it was killed. The docker run will throw errors but the other
    // processes won't. Stop the chain if it was aborted before reaching
    // docker run
    .then(() => checkKilled())
    // Convert to geojson.
    .then(() => {
      DEBUG && console.log(identifier, 'Running osmtogeojson...');
      currentRunning = `p${projId}s${scId}-rn`;
      return dockerRun([
        `-v ${tmpDir}:/data`,
        `--name ${currentRunning}`,
        'wbtransport/rra-vt',
        'node --max_old_space_size=8192 /usr/local/bin/osmtogeojson',
        `/data/${osmName} > ${geojsonFilePath}`
      ]);
    })
    .then(() => { DEBUG && console.log(identifier, 'Running osmtogeojson... done'); })
    // Check if it was killed. Additional check in case docker delayed int
    // throwing the error.
    .then(() => checkKilled())
    // Create tiles.
    .then(() => {
      DEBUG && console.log(identifier, 'Running tippecanoe...');
      currentRunning = `p${projId}s${scId}-tiles`;
      return dockerRun([
        `-v ${tmpDir}:/data`,
        `--name ${currentRunning}`,
        'wbtransport/rra-vt',
        'tippecanoe',
        '-l road-network',
        `-e /data/${tilesFolderName}`,
        `/data/${geojsonName}`
      ]);
    })
    .then(() => { DEBUG && console.log(identifier, 'Running tippecanoe... done'); })
    // Check if it was killed. Additional check in case docker delayed in
    // throwing the error.
    .then(() => checkKilled())
    .then(() => { DEBUG && console.log(identifier, 'Uploading to storage...'); })
    .then(() => putDirectory(tilesFolderPath, `scenario-${scId}/tiles/road-network`))
    .then(() => { DEBUG && console.log(identifier, 'Uploading to storage... done'); })
    // Check if it was killed. putDirectory will not throw an error so stop the
    // run if the analysis was killed while putDirectory was running.
    .then(() => checkKilled());

  return {
    promise: executor,
    kill: () => {
      killed = true;
      return currentRunning
        ? dockerKill(currentRunning)
          .then(() => { currentRunning = null; })
        : Promise.resolve();
    }
  };
}

function dockerRun (args) {
  return new Promise((resolve, reject) => {
    // -u $(id -u) is used to ensure that the volumes are created with the
    // correct user so they can be removed. Otherwise they'd belong to root.
    let base = [
      'docker run',
      '-u $(id -u)',
      '--rm'
    ].concat(args);

    exec(base.join(' '), (error, stdout, stderr) => {
      if (error) {
        console.error('dockerRun error', error);
        reject(error);
        return;
      }
      console.log('dockerRun stdout', stdout);
      console.log('dockerRun stderr', stderr);
      resolve();
    });
  });
}

function dockerKill (container) {
  return new Promise((resolve, reject) => {
    let args = [
      'docker rm -f',
      container
    ];

    exec(args.join(' '), (error, stdout, stderr) => {
      if (error) {
        console.error('dockerKill error', error);
        reject(error);
        return;
      }
      console.log('dockerKill stdout', stdout);
      console.log('dockerKill stderr', stderr);
      resolve();
    });
  });
}
