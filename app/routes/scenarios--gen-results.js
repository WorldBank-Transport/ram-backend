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
        // Admin areas selected ?
        .then(() => db.select('*')
          .from('scenarios')
          .where('id', scId)
          .where('project_id', projId)
          .then(scenarios => {
            if (!scenarios.length) throw new ScenarioNotFoundError();
            return scenarios[0];
          })
          .then(scenario => {
            let hasSelected = scenario.admin_areas.some(o => o.selected);
            if (!hasSelected) {
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
          .where('type', 'results')
            .then(files => {
              let tasks = files.map(f => removeFile(f.path));
              return Promise.all(tasks);
            })
            .then(() => db('scenarios_files')
              .where('scenario_id', scId)
              .where('project_id', projId)
              .where('type', 'results')
              .del()
            )
        )
        // Create an operation.
        .then(() => {
          op = new Operation(db);
          return op.start('generate-analysis', projId, scId);
        })
        .then(op => op.log('generate-analysis', {message: 'Analysis generation started'}))
        // Start generation.
        .then(op => spawnAnalysisProcess(projId, scId, op.getId()))
        .then(() => reply({statusCode: 200, message: 'Result generation started'}))
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];

function spawnAnalysisProcess (projId, scId, opId) {
  // In test mode we don't want to start the generation.
  // It will be tested in the appropriate place.
  if (process.env.DS_ENV === 'test') { return; }

  let args = [
    'run',
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
    '-e', 'CONVERSION_DIR=/conversion',
    config.analysisProcess.container
  ];

  // Spawn the processing script. It will take care of updating
  // the database with progress.
  let analysisProc = cp.spawn('docker', args);
  analysisProc.stdout.on('data', (data) => {
    console.log(`[ANALYSIS P${projId} S${scId}]`, data.toString());
  });

  analysisProc.stderr.on('data', (data) => {
    console.log(`[ANALYSIS P${projId} S${scId}][ERROR]`, data.toString());
  });

  analysisProc.on('close', (code) => {
    console.log(`[ANALYSIS P${projId} S${scId}][EXIT]`, code.toString());
  });
}
