'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { copyFile } from '../s3/utils';
import { ProjectNotFoundError, ScenarioNotFoundError, DataConflictError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/scenarios',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        payload: {
          name: Joi.string().required(),
          description: Joi.string(),
          roadNetworkSource: Joi.string().valid('clone', 'new').required(),
          roadNetworkSourceScenario: Joi.number().when('roadNetworkSource', {is: 'clone', then: Joi.required()})
        }
      }
    },
    handler: (request, reply) => {
      const data = request.payload;
      const source = data.roadNetworkSource;
      const sourceScenarioId = data.roadNetworkSourceScenario;

      db('projects')
        .select('status')
        .where('id', request.params.projId)
        .then(projects => {
          if (!projects.length) throw new ProjectNotFoundError();
          //  It's not possible to create scenarios for pending projects.
          if (projects[0].status === 'pending') throw new DataConflictError('Project setup not completed');
        })
        .then(() => {
          // If we're cloning from a different scenario, make sure it exists.
          if (source === 'clone') {
            return db('scenarios')
              .select('id')
              .where('id', sourceScenarioId)
              .where('project_id', request.params.projId)
              .then((scenarios) => {
                if (!scenarios.length) throw new ScenarioNotFoundError();
              });
          }
        })
        // Check that the provided scenario to copy from exists.
        .then(() => {
          return db.transaction(function (trx) {
            const info = {
              name: data.name,
              description: data.description || '',
              status: 'active',
              master: false,
              project_id: request.params.projId,
              created_at: (new Date()),
              updated_at: (new Date())
            };

            return insertScenario(trx, info)
              .catch(err => {
                if (err.constraint === 'scenarios_project_id_name_unique') {
                  throw new DataConflictError(`Scenario name already in use for this project: ${data.name}`);
                }
                throw err;
              })
              .then(scenario => {
                if (source === 'clone') {
                  return cloneFilesFromScenario(trx, sourceScenarioId, scenario);
                }
                // TODO:
                // - [ ] Handle file upload option
                // - [ ] Add tests for scenario clone option
                // - [ ] Add tests for file upload option
                // - [ ] Make either "cloning from scenario" or "upload new file" mandatory
              });
          });
        })
        .then(() => reply('This is a temporary reply'))
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(ScenarioNotFoundError, e => reply(Boom.badRequest('Source scenario for cloning not found')))
        .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];

function insertScenario (trx, data) {
  return trx('scenarios')
    .returning('*')
    .insert(data)
    .then(res => res[0]);
}

function cloneFilesFromScenario (trx, sourceScenarioId, scenarioData) {
  // Clone files from a different scenario.
  return trx('scenarios_files')
    .select('*')
    .where('scenario_id', sourceScenarioId)
    .where('project_id', scenarioData.project_id)
    // Prepare files.
    .then(files => {
      let newFiles = files.map(file => {
        const fileName = `${file.type}_${Date.now()}`;
        const filePath = `scenario-${scenarioData.id}/${fileName}`;

        return {
          name: fileName,
          type: file.type,
          path: filePath,
          project_id: scenarioData.project_id,
          scenario_id: scenarioData.id,
          created_at: (new Date()),
          updated_at: (new Date())
        };
      });
      return [files, newFiles];
    })
    // Insert new files in the db.
    .then(allFiles => {
      let [oldFiles, newFiles] = allFiles;
      return trx.batchInsert('scenarios_files', newFiles).then(() => [oldFiles, newFiles]);
    })
    // Copy files on s3.
    .then(allFiles => {
      let [oldFiles, newFiles] = allFiles;
      return Promise.map(oldFiles, (old, i) => copyFile(old.path, newFiles[i].path));
    });
}
