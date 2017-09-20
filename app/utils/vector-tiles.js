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

export function createAdminBoundsVT (projId, scId, op, fc) {
  // Promisify functions.
  const removeP = Promise.promisify(fs.remove);
  const writeJsonP = Promise.promisify(fs.writeJson);

  const geojsonName = `p${projId}s${scId}-fc.geojson`;
  const tilesFolderName = `p${projId}s${scId}-tiles`;
  const geojsonFilePath = path.resolve(os.tmpdir(), geojsonName);
  const tilesFolderPath = path.resolve(os.tmpdir(), tilesFolderName);

  // Clean any existing files, locally and from S3.
  return op.log('process:admin-bounds', {message: 'Creating admin bounds vector tiles'})
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
    // Create tiles.
    .then(() => dockerRun([
      `-v ${os.tmpdir()}:/data`,
      'vt',
      'tippecanoe',
      '-l bounds',
      `-e /data/${tilesFolderName}`,
      `/data/${geojsonName}`
    ]))
    .then(() => putDirectory(tilesFolderPath, `project-${projId}/tiles/admin-bounds`));
}

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

  // Clean any existing files, locally and from S3.
  return op.log('process:road-network', {message: 'Creating road-network vector tiles'})
    // Clean up phase.
    .then(() => Promise.all([
      removeP(osmFilePath),
      removeP(geojsonFilePath),
      removeP(tilesFolderPath),
      // Clean S3 directory
      removeS3Dir(`scenario-${scId}/tiles/road-network`)
    ]))
    .then(() => writeFile(osmFilePath, roadNetwork))
    // Convert to geojson.
    .then(() => dockerRun([
      `-v ${os.tmpdir()}:/data`,
      'vt',
      'node --max_old_space_size=8192 /usr/local/bin/osmtogeojson',
      `/data/${osmName} > ${geojsonFilePath}`
    ]))
    // Create tiles.
    .then(() => dockerRun([
      `-v ${os.tmpdir()}:/data`,
      'vt',
      'tippecanoe',
      '-l road-network',
      `-e /data/${tilesFolderName}`,
      `/data/${geojsonName}`
    ]))
    .then(() => putDirectory(tilesFolderPath, `scenario-${scId}/tiles/road-network`));
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
        console.error(`exec error: ${error}`);
        reject(error);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.log(`stderr: ${stderr}`);
      resolve();
    });
  });
}
