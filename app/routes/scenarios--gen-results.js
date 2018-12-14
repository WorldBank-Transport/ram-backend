'use strict';
import Joi from 'joi';
import Promise from 'bluebird';
import cp from 'child_process';

import config from '../config';
import db from '../db/';
import { removeFile } from '../s3/utils';
import { ScenarioNotFoundError, DataConflictError, getBoomResponseForError } from '../utils/errors';
import { getProject } from './projects--get';
import Operation from '../utils/operation';
import ServiceRunner from '../utils/service-runner';
import { closeDatabase } from '../services/rra-osm-p2p';
import { createRoadNetworkVT } from '../utils/vector-tiles';

// Stores running processes to be able to kill them.
let runningProcesses = {};

module.exports = [
  {
    path: '/projects/{projId}/scenarios/{scId}/generate',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        }
      }
    },
    handler: (request, reply) => {
      const { projId, scId } = request.params;

      let op = new Operation(db);
      op.loadByData('generate-analysis', projId, scId)
        .then(op => {
          if (op.isStarted()) {
            throw new DataConflictError('Result generation already running');
          }
        }, err => {
          // In this case if the operation doesn't exist is not a problem.
          if (err.message.match(/not exist/)) { return; }
          throw err;
        })
        // Valid project ?
        // Projects already setup ?
        .then(() => getProject(projId))
        .then(project => {
          if (project.status !== 'active') {
            throw new DataConflictError('Project setup not completed');
          }
          return project;
        })
        // Valid scenario ?
        .then(() => db.select('*')
          .from('scenarios')
          .where('id', scId)
          .where('project_id', projId)
          .then(scenarios => {
            if (!scenarios.length) throw new ScenarioNotFoundError();
            return scenarios[0];
          })
          // Admin areas selected ?
          .then(scenario => db('scenarios_settings')
            .select('value')
            .where('key', 'admin_areas')
            .where('scenario_id', scId)
            .first()
            .then(setting => {
              if (setting.value === '[]') {
                throw new DataConflictError('No admin areas selected');
              }
            })
        )
        // Good to go.
        // Delete all existing results. (s3 and database)
        .then(() => db('scenarios_files')
          .select('*')
          .where('scenario_id', scId)
          .where('project_id', projId)
          .whereIn('type', ['results-csv', 'results-json', 'results-geojson'])
          .then(files => {
            let tasks = files.map(f => removeFile(f.path));
            let ids = files.map(f => f.id);
            return Promise.all(tasks)
              .then(() => db('scenarios_files')
                .whereIn('id', ids)
                .del()
              )
              .then(() => db('results')
                .where('project_id', projId)
                .where('scenario_id', scId)
                .del()
              );
          }))
        )
        // Create an operation.
        .then(() => {
          op = new Operation(db);
          return op.start('generate-analysis', projId, scId);
        })
        .then(op => op.log('start', {message: 'Analysis generation started'}))
        // Start generation.
        .then(op => generateResults(projId, scId, op))
        .then(() => reply({statusCode: 200, message: 'Result generation started'}))
        .catch(err => reply(getBoomResponseForError(err)));
    }
  },
  {
    path: '/projects/{projId}/scenarios/{scId}/generate',
    method: 'DELETE',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        }
      }
    },
    handler: (request, reply) => {
      const { projId, scId } = request.params;

      let op = new Operation(db);
      op.loadByData('generate-analysis', projId, scId)
        .then(op => {
          if (!op.isStarted()) {
            throw new DataConflictError('Result generation not running');
          }
        }, err => {
          // In this case if the operation doesn't exist is not a problem.
          if (err.message.match(/not exist/)) {
            throw new DataConflictError('Result generation not running');
          }
          throw err;
        })
        // Send kill signal to generation process.
        .then(() => killAnalysisProcess(projId, scId))
        // Abort operation.
        .then(() => op.finish('error', {error: 'Operation aborted'}))
        .then(() => reply({statusCode: 200, message: 'Result generation aborted'}))
        .catch(err => reply(getBoomResponseForError(err)));
    }
  }
];

function generateResults (projId, scId, op) {
  // In test mode we don't want to start the generation.
  // It will be tested in the appropriate place.
  if (process.env.DS_ENV === 'test') { return; }

  let opId = op.getId();

  let identifier = `p${projId} s${scId}`;
  if (!runningProcesses[identifier]) runningProcesses[identifier] = {};

  // Check if we need to export the road network.
  db('scenarios_settings')
    .select('value')
    .where('scenario_id', scId)
    .whereIn('key', ['res_gen_at', 'rn_active_editing', 'rn_updated_at'])
    .orderBy('key')
    .then(scSettings => {
      const activeEditing = scSettings[1].value;
      let genAt = scSettings[0].value;
      let rnUpdatedAt = scSettings[2].value;

      let needExport = false;
      if (activeEditing === 'true') {
        genAt = genAt === 0 ? genAt : (new Date(genAt)).getTime();
        rnUpdatedAt = rnUpdatedAt === 0 ? rnUpdatedAt : (new Date(rnUpdatedAt)).getTime();

        needExport = rnUpdatedAt > genAt;
        if (!needExport) {
          console.log(identifier, 'Road network was not modified');
        }
      } else {
        console.log(identifier, 'Road network editing not enabled');
      }

      setImmediate(() => {
        let executor = Promise.resolve();

        if (needExport) {
          executor = executor
            // Close the database on this process before exporting the road network.
            .then(() => closeDatabase(projId, scId))
            .then(() => updateRN(projId, scId, opId))
            .then(() => generateTiles(projId, scId, op));
        }

        executor.then(() => spawnAnalysisProcess(projId, scId, opId))
          .catch(err => {
            console.log(identifier, 'generateResults error was handled:', err);
          });
      });
    });
}

function updateRN (projId, scId, opId, cb) {
  return new Promise((resolve, reject) => {
    let identifier = `p${projId} s${scId}`;
    console.log(identifier, 'updateRN');
    let service = new ServiceRunner('export-road-network', {projId, scId, opId});

    runningProcesses[identifier].updateRN = service;

    service.on('complete', err => {
      runningProcesses[identifier].updateRN = null;
      console.log(identifier, 'updateRN complete');

      if (err) {
        console.log(identifier, 'updateRN ended in error and was captured');
        // The operation may not have finished if the error took place outside
        // the promise, or if the error was due to a wrong db connection.
        let op = new Operation(db);
        op.loadById(opId)
          .then(op => {
            if (!op.isCompleted()) {
              return op.finish('error', {error: err.message});
            }
          })
          .then(() => reject(err), () => reject(err));
      } else {
        resolve();
      }
    })
    .start();
  });
}

function generateTiles (projId, scId, op) {
  let identifier = `p${projId} s${scId}`;
  console.log(identifier, 'generating vector tiles');

  let executor = db('scenarios_files')
    .select('*')
    .where('scenario_id', scId)
    .where('type', 'road-network')
    .first()
    .then(file => {
      // createRoadNetworkVT returns an objects with a promise and a kill switch
      let service = createRoadNetworkVT(projId, scId, op, file.path);
      runningProcesses[identifier].genVT = service;

      return service.promise;
    })
    .then(() => {
      runningProcesses[identifier].genVT = null;
    })
    .catch(err => {
      let executor = Promise.resolve();
      if (!op.isCompleted()) {
        executor = executor
          .then(() => op.finish('error', {error: err.message}));
      }

      // Rethrow to stop;
      return executor.then(() => { throw err; });
    });

  return executor;
}

function spawnAnalysisProcess (projId, scId, opId) {
  // Update image before starting.
  function pullImage () {
    return new Promise((resolve, reject) => {
      const cmd = config.analysisProcess.service;
      const args = [ 'pull', config.analysisProcess.container ];
      const env = {
        HYPER_ACCESS: config.analysisProcess.hyperAccess,
        HYPER_SECRET: config.analysisProcess.hyperSecret
      };

      // Make sure the latest image (dev / stable) is used.
      let pullImage = cp.spawn(cmd, args, { env: Object.assign({}, process.env, env) });

      let error;
      pullImage.stderr.on('data', (data) => {
        error = data.toString();
        console.log(`[ANALYSIS P${projId} S${scId}][ERROR]`, error);
      });

      pullImage.on('close', code => {
        if (code !== 0) {
          console.log(`[ANALYSIS P${projId} S${scId}][ERROR]`, 'Pull image error', error);
          console.log(`[ANALYSIS P${projId} S${scId}][ERROR]`, 'Continuing...');
        }
        return resolve();
      });
    });
  }

  // Run the analysis.
  function runProcess () {
    return new Promise((resolve, reject) => {
      console.log(`[ANALYSIS P${projId} S${scId}]`, 'spawnAnalysisProcess');
      const containerName = `${config.instanceId}-analysisp${projId}s${scId}`;
      const service = config.analysisProcess.service;
      let env = {};

      // Each Project/Scenario combination can only have one analysis process
      // running.
      let args = [
        'run',
        '--name', containerName,
        '--rm',
        '-e', `DB_URI=${config.analysisProcess.db}`,
        '-e', `PROJECT_ID=${projId}`,
        '-e', `SCENARIO_ID=${scId}`,
        '-e', `OPERATION_ID=${opId}`,
        '-e', `STORAGE_HOST=${config.analysisProcess.storageHost}`,
        '-e', `STORAGE_PORT=${config.analysisProcess.storagePort}`,
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
            HYPER_ACCESS: config.analysisProcess.hyperAccess,
            HYPER_SECRET: config.analysisProcess.hyperSecret
          };
          if (config.analysisProcess.hyperSize) {
            args.push(
              `--size=${config.analysisProcess.hyperSize}`
            );
          }
          break;
        default:
          return Promise.reject(new Error(`${service} is not a valid option. The analysis should be run on 'docker' or 'hyper'. Check your config file or env variables.`));
      }

      // Append the name of the image last
      args.push(config.analysisProcess.container);

      let proc = cp.spawn(service, args, { env: Object.assign({}, process.env, env) });
      let error;

      proc.stdout.on('data', (data) => {
        console.log(`[ANALYSIS P${projId} S${scId}]`, data.toString());
      });

      proc.stderr.on('data', (data) => {
        error = data.toString();
        console.log(`[ANALYSIS P${projId} S${scId}][ERROR]`, error);
      });

      proc.on('close', (code) => {
        let identifier = `p${projId} s${scId}`;
        console.log(`[ANALYSIS P${projId} S${scId}][EXIT]`, code.toString());
        delete runningProcesses[identifier];

        if (code !== 0) {
          // The operation may not have finished if the error took place outside
          // the promise, or if the error was due to a wrong db connection.
          let op = new Operation(db);
          return op.loadById(opId)
            .then(op => {
              if (!op.isCompleted()) {
                return op.finish('error', {error: error});
              }
            })
            .then(() => reject(error), () => reject(error));
        }

        return resolve();
      });
    });
  }

  return pullImage()
    .then(() => runProcess());
}

function killAnalysisProcess (projId, scId) {
  if (process.env.DS_ENV === 'test') { return Promise.resolve(); }

  return new Promise((resolve, reject) => {
    let identifier = `p${projId} s${scId}`;
    // Since the processes run sequentially check by order which we need
    // to kill.
    if (runningProcesses[identifier].updateRN) {
      runningProcesses[identifier].updateRN.kill();
      runningProcesses[identifier].updateRN = null;
      return resolve();
    }
    if (runningProcesses[identifier].genVT) {
      runningProcesses[identifier].genVT.kill();
      runningProcesses[identifier].genVT = null;
      return resolve();
    }

    const service = config.analysisProcess.service;
    const containerName = `${config.instanceId}-analysisp${projId}s${scId}`;
    let env = {};

    switch (service) {
      case 'hyper':
        env = {
          HYPER_ACCESS: config.analysisProcess.hyperAccess,
          HYPER_SECRET: config.analysisProcess.hyperSecret
        };
        break;
      case 'docker':
        break;
      default:
        return reject(new Error(`${service} is not a valid option. The analysis should be run on 'docker' or 'hyper'. Check your config file or env variables.`));
    }

    cp.exec(`${service} rm -f ${containerName}`, { env: Object.assign({}, process.env, env) }, (errStop) => {
      if (errStop) {
        console.log(`[ANALYSIS P${projId} S${scId}][ABORT] stop`, errStop);
      }
    });

    // Assume the exec works and resolve immediately. The closing of the
    // connection is handled by the process spawn in spawnAnalysisProcess();
    return resolve();
  });
}
