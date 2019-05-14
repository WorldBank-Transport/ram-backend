'use strict';
import { spawn, exec } from 'child_process';
import Promise from 'bluebird';

import config from '../config';
import { prepareAWSTask } from './aws-task-runner';

function pullImage (projId, scId) {
  return new Promise((resolve, reject) => {
    const cmd = config.vtProcess.service;
    const args = [ 'pull', config.vtProcess.container ];
    const env = {
      HYPER_ACCESS: config.vtProcess.hyperAccess,
      HYPER_SECRET: config.vtProcess.hyperSecret
    };

    // Make sure the latest image (dev / stable) is used.
    let pullImage = spawn(cmd, args, { env: Object.assign({}, process.env, env) });

    let error;
    pullImage.stderr.on('data', (data) => {
      error = data.toString();
      console.log(`[VT P${projId} S${scId}][ERROR]`, error);
    });

    pullImage.on('close', code => {
      if (code !== 0) {
        console.log(`[VT P${projId} S${scId}][ERROR]`, 'Pull image error', error);
        console.log(`[VT P${projId} S${scId}][ERROR]`, 'Continuing...');
      }
      return resolve();
    });
  });
}

function killSwitch (projId, scId) {
  return new Promise((resolve, reject) => {
    const service = config.vtProcess.service;
    const containerName = `${config.instanceId}-vtp${projId}s${scId}`;
    let env = {};

    switch (service) {
      case 'hyper':
        env = {
          HYPER_ACCESS: config.vtProcess.hyperAccess,
          HYPER_SECRET: config.vtProcess.hyperSecret
        };
        break;
      case 'docker':
        break;
      default:
        return reject(new Error(`${service} is not a valid option. The analysis should be run on 'docker' or 'hyper'. Check your config file or env variables.`));
    }

    exec(`${service} rm -f ${containerName}`, { env: Object.assign({}, process.env, env) }, (errStop) => {
      if (errStop) {
        console.log(`[VT P${projId} S${scId}][ABORT] stop`, errStop);
        return reject(errStop);
      }
      resolve();
    });
  });
}

function runProcess (projId, scId, sourceFile, vtType) {
  return new Promise((resolve, reject) => {
    console.log(`[VT P${projId} S${scId} ${vtType}]`, 'spawnVectorTilesProcess', vtType);
    const containerName = `vtp${projId}s${scId}-${vtType}`;
    const service = config.vtProcess.service;
    let env = {};

    // Each Project/Scenario combination can only have one vt process running.
    let args = [
      'run',
      '--name', containerName,
      '--rm',
      '-e', `PROJECT_ID=${projId}`,
      '-e', `SCENARIO_ID=${scId}`,
      '-e', `SOURCE_FILE=${sourceFile}`,
      '-e', `VT_TYPE=${vtType}`,
      '-e', `STORAGE_HOST=${config.vtProcess.storageHost}`,
      '-e', `STORAGE_PORT=${config.vtProcess.storagePort}`,
      '-e', `STORAGE_ENGINE=${config.storage.engine}`,
      '-e', `STORAGE_ACCESS_KEY=${config.storage.accessKey}`,
      '-e', `STORAGE_SECRET_KEY=${config.storage.secretKey}`,
      '-e', `STORAGE_BUCKET=${config.storage.bucket}`,
      '-e', `STORAGE_REGION=${config.storage.region}`,
      '-e', 'CONVERSION_DIR=/conversion'
    ];

    switch (service) {
      case 'docker':
        args.push(
          '--network', 'ram'
        );
        break;
      case 'hyper':
        env = {
          HYPER_ACCESS: config.vtProcess.hyperAccess,
          HYPER_SECRET: config.vtProcess.hyperSecret
        };
        if (config.vtProcess.hyperSize) {
          args.push(
            `--size=${config.vtProcess.hyperSize}`
          );
        }
        break;
      default:
        return Promise.reject(new Error(`${service} is not a valid option. The analysis should be run on 'docker' or 'hyper'. Check your config file or env variables.`));
    }

    // Append the name of the image last
    args.push(config.vtProcess.container);
    // Add the command to run.
    // The `ram-vt` command is the one responsible to generate the vector tiles.
    // This container has other commands available like
    // osmtogeojson and tippecanoe
    args.push('ram-vt');

    let proc = spawn(service, args, { env: Object.assign({}, process.env, env) });
    let error;

    proc.stdout.on('data', (data) => {
      console.log(`[VT P${projId} S${scId} ${vtType}]`, data.toString());
    });

    proc.stderr.on('data', (data) => {
      error = data.toString();
      console.log(`[VT P${projId} S${scId} ${vtType}][ERROR]`, error);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        return resolve();
      } else {
        return reject(new Error(error || 'Unknown error. Code: ' + code));
      }
    });
  });
}

/**
 * Helper function to contruct the aws task.
 *
 * @param  {int} projId
 * @param  {int} scId
 * @param  {String} sourceFile
 * @param  {type} type Type of vector tiles generation. (admin-bounds|road-network)
 */
function initAWSTask (projId, scId, sourceFile, type) {
  // Perform check of env variables.
  const globalVars = [
    'VT_TASK_DEF',
    'VT_AWS_LOG_GROUP'
  ].filter(v => !process.env[v]);

  if (globalVars.length) {
    throw new Error(`Missing env vars for vt aws task: ${globalVars.join(', ')}`);
  }

  const params = {
    environment: {
      PROJECT_ID: projId,
      SCENARIO_ID: scId,
      SOURCE_FILE: sourceFile,
      VT_TYPE: type
    },
    taskDefinition: process.env.VT_TASK_DEF,
    logGroupName: process.env.VT_AWS_LOG_GROUP
  };

  return prepareAWSTask('ram-vt', params, 'ram-vt');
}

/**
 * Create the vector tiles for the admin bounds.
 * Full process:
 * - Clean up local folders
 * - Clean up remote storage
 * - Write geojson file to disk
 * - Convert geojson to vector tiles
 * - Upload vector-tiles to remote storage
 *
 * Note: All is done inside a Docker container
 *
 * @param  {int} projId
 * @param  {int} scId
 * @param  {Operation} op
 * @param  {String} adminBoundsPath
 *
 * @return Object with a `promise` and a `kill` switch.
 */
export function createAdminBoundsVT (projId, scId, op, adminBoundsPath) {
  // Using an executor because this function needs to return an object
  // instead of a promise.
  let executor = op.log('admin-bounds', {message: 'Creating admin-bounds vector tiles'});

  // When running in aws it needs to be started in a different way.
  if (config.vtProcess.service === 'aws') {
    let awsTask;
    try {
      awsTask = initAWSTask(projId, scId, adminBoundsPath, 'admin-bounds');
    } catch (error) {
      return {
        promise: executor.then(() => Promise.reject(error)),
        kill: Promise.resolve()
      };
    }

    awsTask.on('data', data => {
      console.log(`[VT P${projId} S${scId} admin-bounds]`, data.message);
    });

    executor = executor
      .then(() => awsTask.run())
      .then(success => {
        if (!success) {
          const err = new Error(`Admin bounds vector tiles generation failed. (AWS Task exited with non 0 code on ${new Date().toUTCString()})`);
          err.awsDetails = awsTask.getLastStatus();
          throw err;
        }
      });

    return {
      promise: executor,
      kill: awsTask.kill
    };

    // Docker or Hyper.
  } else {
    executor = executor
      .then(() => pullImage(projId, scId))
      .then(() => runProcess(projId, scId, adminBoundsPath, 'admin-bounds'));

    return {
      promise: executor,
      kill: () => killSwitch(projId, scId)
    };
  }
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
 * Note: All is done inside a Docker container
 *
 * @param  {int} projId
 * @param  {int} scId
 * @param  {Operation} op
 * @param  {String} roadNetworkPath
 *
 * @return Object with a `promise` and a `kill` switch.
 */
export function createRoadNetworkVT (projId, scId, op, roadNetworkPath) {
  // Using an executor because this function needs to return an object
  // instead of a promise.
  let executor = op.log('road-network', {message: 'Creating road-network vector tiles'});

  // When running in aws it needs to be started in a different way.
  if (config.vtProcess.service === 'aws') {
    let awsTask;
    try {
      awsTask = initAWSTask(projId, scId, roadNetworkPath, 'road-network');
    } catch (error) {
      return {
        promise: executor.then(() => Promise.reject(error)),
        kill: Promise.resolve()
      };
    }

    awsTask.on('data', data => {
      console.log(`[VT P${projId} S${scId} road-network]`, data.message);
    });

    executor = executor
      .then(() => awsTask.run())
      .then(success => {
        if (!success) {
          const err = new Error(`Road network vector tiles generation failed. (AWS Task exited with non 0 code on ${new Date().toUTCString()})`);
          err.awsDetails = awsTask.getLastStatus();
          throw err;
        }
      });

    return {
      promise: executor,
      kill: () => awsTask.kill()
    };

    // Docker or Hyper.
  } else {
    executor = executor
      .then(() => pullImage(projId, scId))
      .then(() => runProcess(projId, scId, roadNetworkPath, 'road-network'));

    return {
      promise: executor,
      kill: () => killSwitch(projId, scId)
    };
  }
}
