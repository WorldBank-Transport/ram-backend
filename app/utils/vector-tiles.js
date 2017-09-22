'use strict';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import os from 'os';
import Promise from 'bluebird';

import {
  removeDir as removeS3Dir,
  putDirectory
} from '../s3/utils';

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
  // Promisify functions.
  const removeP = Promise.promisify(fs.remove);
  const writeJsonP = Promise.promisify(fs.writeJson);

  const geojsonName = `p${projId}s${scId}-fc.geojson`;
  const tilesFolderName = `p${projId}s${scId}-tiles`;
  const geojsonFilePath = path.resolve(os.tmpdir(), geojsonName);
  const tilesFolderPath = path.resolve(os.tmpdir(), tilesFolderName);

  let currentRunning = null;
  let killed = false;
  let checkKilled = () => { if (killed) throw new Error('Process manually terminated'); };

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
    .then(() => writeJsonP(geojsonFilePath, fc))
    // Check if it was killed. The docker run will throw errors but the other
    // processes won't. Stop the chain if it was aborted before reaching
    // docker run
    .then(() => checkKilled())
    // Create tiles.
    .then(() => {
      currentRunning = `p${projId}s${scId}-bounds`;
      return dockerRun([
        `-v ${os.tmpdir()}:/data`,
        `--name ${currentRunning}`,
        'vt',
        'tippecanoe',
        '-l bounds',
        `-e /data/${tilesFolderName}`,
        `/data/${geojsonName}`
      ]);
    })
    // Check if it was killed. Additional check in case docker delayed in
    // throwing the error.
    .then(() => checkKilled())
    .then(() => putDirectory(tilesFolderPath, `project-${projId}/tiles/admin-bounds`))
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
 * @param  {String} roadNetwork
 *
 * @return Object with a `promise` and a `kill` switch.
 */
export function createRoadNetworkVT (projId, scId, op, roadNetwork) {
  // Promisify functions.
  const removeP = Promise.promisify(fs.remove);
  const writeFile = Promise.promisify(fs.writeFile);

  const osmName = `p${projId}s${scId}-rn.osm`;
  const geojsonName = `p${projId}s${scId}-rn.geojson`;
  const tilesFolderName = `p${projId}s${scId}-rn-tiles`;
  const osmFilePath = path.resolve(os.tmpdir(), osmName);
  const geojsonFilePath = path.resolve(os.tmpdir(), geojsonName);
  const tilesFolderPath = path.resolve(os.tmpdir(), tilesFolderName);

  let currentRunning = null;
  let killed = false;
  let checkKilled = () => { if (killed) throw new Error('Process manually terminated'); };

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
    .then(() => writeFile(osmFilePath, roadNetwork))
    // Check if it was killed. The docker run will throw errors but the other
    // processes won't. Stop the chain if it was aborted before reaching
    // docker run
    .then(() => checkKilled())
    // Convert to geojson.
    .then(() => {
      currentRunning = `p${projId}s${scId}-rn`;

      return dockerRun([
        `-v ${os.tmpdir()}:/data`,
        `--name ${currentRunning}`,
        'wbtransport/rra-vt',
        'node --max_old_space_size=8192 /usr/local/bin/osmtogeojson',
        `/data/${osmName} > ${geojsonFilePath}`
      ]);
    })
    // Check if it was killed. Additional check in case docker delayed in
    // throwing the error.
    .then(() => checkKilled())
    // Create tiles.
    .then(() => {
      currentRunning = `p${projId}s${scId}-tiles`;
      return dockerRun([
        `-v ${os.tmpdir()}:/data`,
        `--name ${currentRunning}`,
        'wbtransport/rra-vt',
        'tippecanoe',
        '-l road-network',
        `-e /data/${tilesFolderName}`,
        `/data/${geojsonName}`
      ]);
    })
    .then(() => putDirectory(tilesFolderPath, `scenario-${scId}/tiles/road-network`))
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
