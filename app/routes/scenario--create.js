'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { copyFile, getPresignedUrl, listenForFile } from '../s3/utils';
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
              .then(scenario => cloneNeededScenarioFiles(trx, source, sourceScenarioId, scenario))
              .then(scenario => db('projects').update({updated_at: (new Date())}).where('id', request.params.projId).then(() => scenario))
              .then(scenario => {
                if (source === 'new') {
                  return handleRoadNetworkUpload(reply, scenario);
                }
                // Else we're done.
                return reply(scenario);
              });
          });
        })
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

// Get the presigned url for file upload and send it to the client.
// Listen for file changes to update the database.
function handleRoadNetworkUpload (reply, scenario) {
  const type = 'road-network';
  const fileName = `${type}_${Date.now()}`;
  const filePath = `scenario-${scenario.id}/${fileName}`;

  return getPresignedUrl(filePath)
    .then(presignedUrl => {
      scenario.roadNetworkUpload = {
        fileName: fileName,
        presignedUrl
      };

      return reply(scenario);
    })
    .then(() => listenForFile(filePath))
    .then(record => {
      let now = new Date();
      let data = {
        name: fileName,
        type: type,
        path: filePath,
        project_id: scenario.project_id,
        scenario_id: scenario.id,
        created_at: now,
        updated_at: now
      };

      db('scenarios_files')
        .returning('*')
        .insert(data)
        .then(res => {
          console.log('res', res);
        })
        .then(() => db('scenarios').update({updated_at: now, status: 'active'}).where('id', scenario.id))
        .then(() => db('projects').update({updated_at: now}).where('id', scenario.project_id))
        .catch(err => {
          console.log('err', err);
        });
    });
}

// Clones the needed files based on the roadNetworkSource.
// case "clone": road-network and poi
// case "new": poi
function cloneNeededScenarioFiles (trx, roadNetworkSource, sourceScenarioId, scenarioData) {
  let res;
  if (roadNetworkSource === 'clone') {
    // Clone files from a different scenario.
    res = trx('scenarios_files')
      .select('*')
      .where('scenario_id', sourceScenarioId)
      .where('project_id', scenarioData.project_id)
      .then(files => cloneScenarioFiles(trx, files, scenarioData));
  }
  if (roadNetworkSource === 'new') {
    // When uploading a new file we do so only for the
    // road-network. Since the poi file is identical for all
    // scenarios of the project just clone it from the master.
    res = trx('scenarios_files')
      .select('*')
      .where('master', true)
      .where('project_id', scenarioData.project_id)
      .where('type', 'poi')
      .then(files => cloneScenarioFiles(trx, files, scenarioData));
  }

  // Send back scenario data.
  return res.then(() => scenarioData);
}

// Copies the given files from a to the new scenario, both the database entries
// and the physical file.
function cloneScenarioFiles (trx, files, scenarioData) {
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

  return Promise.resolve([files, newFiles])
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
