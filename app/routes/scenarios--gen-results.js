'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';
import cp from 'child_process';

import config from '../config';
import db from '../db/';
import { removeFile } from '../s3/utils';
import { ProjectNotFoundError, ScenarioNotFoundError, DataConflictError } from '../utils/errors';
import { getProject } from './projects--get';
import Operation from '../utils/operation';
// import ServiceRunner from '../utils/service-runner';
// import { closeDatabase } from '../services/rra-osm-p2p';

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
          .whereIn('type', ['results', 'results-all'])
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
        .then(op => generateResults(projId, scId, op.getId()))
        .then(() => reply({statusCode: 200, message: 'Result generation started'}))
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
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
        .then(() => op.log('error', {error: 'Operation aborted'}).then(op => op.finish()))
        .then(() => reply({statusCode: 200, message: 'Result generation aborted'}))
        .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];

function generateResults (projId, scId, opId) {
  // In test mode we don't want to start the generation.
  // It will be tested in the appropriate place.
  if (process.env.DS_ENV === 'test') { return; }

  spawnAnalysisProcess(projId, scId, opId);

  // process.nextTick(() => {
  //   // Close the database on this process before exporting the road network.
  //   closeDatabase(projId, scId).then(() => {
  //     updateRN(projId, scId, opId, (err) => {
  //       // The error is logged to the db inside `updateRN`.
  //       // There's nothing else to do.
  //       if (!err) {
  //         spawnAnalysisProcess(projId, scId, opId);
  //       }
  //     });
  //   });
  // });
}

// function updateRN (projId, scId, opId, cb) {
//   console.log(`p${projId} s${scId}`, 'updateRN');
//   let service = new ServiceRunner('export-road-network', {projId, scId, opId});

//   service.on('complete', err => {
//     console.log(`p${projId} s${scId}`, 'updateRN complete');
//     if (err) {
//       // The operation may not have finished if the error took place outside
//       // the promise, or if the error was due to a wrong db connection.
//       let op = new Operation(db);
//       op.loadById(opId)
//         .then(op => {
//           if (!op.isCompleted()) {
//             return op.log('error', {error: err.message})
//               .then(op => op.finish());
//           }
//         })
//         .then(() => cb(err), () => cb(err));
//     } else {
//       cb();
//     }
//   })
//   .start();
// }

function spawnAnalysisProcess (projId, scId, opId) {
  console.log(`p${projId} s${scId}`, 'spawnAnalysisProcess');
  // Each Project/Scenario combination can only have one analysis process
  // running.
  let containerName = `analysisp${projId}s${scId}`;
  let args = [
    'run',
    '--name', containerName,
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

  let service = config.analysisProcess.service;
  switch (service) {
    case 'docker':
      args.push(
        '--network', 'rra'
      );
      break;
    case 'hyper':
      args.push(
        '-e', `HYPER_ACCESS=${config.analysisProcess.hyperAccess}`,
        '-e', `HYPER_SECRET=${config.analysisProcess.hyperSecret}`
      );
      break;
    default:
      throw new Error(`${service} is not a valid option. The analysis should be run on 'docker' or 'hyper'. Check your config file or env variables.`);
  }

  // Append the name of the image last
  args.push(config.analysisProcess.container);

  // Spawn the processing script. It will take care of updating
  // the database with progress.
  let analysisProc = cp.spawn(service, args);
  analysisProc.stdout.on('data', (data) => {
    console.log(`[ANALYSIS P${projId} S${scId}]`, data.toString());
  });

  let error;
  analysisProc.stderr.on('data', (data) => {
    error = data.toString();
    console.log(`[ANALYSIS P${projId} S${scId}][ERROR]`, data.toString());
  });

  analysisProc.on('close', (code) => {
    if (code !== 0) {
      // The operation may not have finished if the error took place outside
      // the promise, or if the error was due to a wrong db connection.
      let op = new Operation(db);
      op.loadById(opId)
        .then(op => {
          if (!op.isCompleted()) {
            return op.log('error', {error: error})
              .then(op => op.finish());
          }
        });
    }
    // Remove the container once the process is finished. Especially important
    // for a hosted scenario, in which stopped containers may incur costs.
    cp.spawn(service, ['rm', containerName]);
    console.log(`[ANALYSIS P${projId} S${scId}][EXIT]`, code.toString());
  });
}

function killAnalysisProcess (projId, scId) {
  if (process.env.DS_ENV === 'test') { return Promise.resolve(); }

  return new Promise(resolve => {
    let containerName = `analysisp${projId}s${scId}`;
    let args = [];

    let service = config.analysisProcess.service;
    switch (service) {
      case 'hyper':
        args.push(
          '-e', `HYPER_ACCESS=${config.analysisProcess.hyperAccess}`,
          '-e', `HYPER_SECRET=${config.analysisProcess.hyperSecret}`
        );
      case 'docker': // eslint-disable-line
        args.push('-t', '1');
        break;
      default:
        throw new Error(`${service} is not a valid option. The analysis should be run on 'docker' or 'hyper'. Check your config file or env variables.`);
    }

    cp.exec(`${service} stop ${args.join(' ')} ${containerName}`, (errStop) => {
      if (errStop) {
        console.log(`[ANALYSIS P${projId} S${scId}][ABORT] stop`, errStop);
      }
      cp.exec(`${service} rm ${containerName}`, (errRm) => {
        // This is likely to throw an error because stopping the container
        // will trigger the remove action on the close listener of the analysis
        // process. In any case better safe than sorry.
        if (errRm) {
          console.log(`[ANALYSIS P${projId} S${scId}][ABORT] rm`, errRm);
        }
        resolve();
      });
    });
  });
}
