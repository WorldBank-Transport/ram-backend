'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';
import cp from 'child_process';

import config from '../config';
import db from '../db/';
import { ProjectNotFoundError, DataConflictError } from '../utils/errors';
import { getProject } from './projects--get';

module.exports = [
  {
    path: '/projects/{projId}/finish-setup',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        payload: {
          scenarioName: Joi.string().required(),
          scenarioDescription: Joi.string()
        }
      }
    },
    handler: (request, reply) => {
      getProject(request.params.projId)
        .then(project => {
          if (project.status !== 'pending') {
            throw new DataConflictError('Project setup already completed');
          }
          if (!project.readyToEndSetup) {
            throw new DataConflictError('Project preconditions to finish setup not met');
          }
          return project;
        })
        .then(project => {
          return db.transaction(function (trx) {
            let {scenarioName, scenarioDescription} = request.payload;

            return trx('scenarios')
              .select('id')
              .where('project_id', project.id)
              .where('master', true)
              .then(scenario => {
                let scId = scenario[0].id;

                return Promise.all([
                  trx('projects')
                    .update({
                      updated_at: (new Date()),
                      status: 'active'
                    })
                    .where('id', project.id),
                  trx('scenarios')
                    .update({
                      name: scenarioName,
                      description: typeof scenarioDescription === 'undefined' ? '' : scenarioDescription,
                      updated_at: (new Date()),
                      status: 'active'
                    })
                    .where('id', scId)
                ])
                .then(() => {
                  let args = [
                    'run',
                    '-e', `DB_URI=${config.analysisProcess.db}`,
                    '-e', `PROJECT_ID=${project.id}`,
                    '-e', `SCENARIO_ID=${scId}`,
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
                    console.log(`[ANALYSIS P${project.id} S${scId}]`, data.toString());
                  });

                  analysisProc.stderr.on('data', (data) => {
                    console.log(`[ANALYSIS P${project.id} S${scId}][ERROR]`, data.toString());
                  });

                  analysisProc.on('close', (code) => {
                    console.log(`[ANALYSIS P${project.id} S${scId}][EXIT]`, code.toString());
                  });
                });
              });
          });
        })
        .then(() => reply({statusCode: 200, message: 'Project setup finished'}))
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
