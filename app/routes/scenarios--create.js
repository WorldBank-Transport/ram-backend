'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { putFile as putFileToS3, removeLocalFile } from '../s3/utils';
import { ProjectNotFoundError, ScenarioNotFoundError, DataConflictError, DataValidationError } from '../utils/errors';
import Operation from '../utils/operation';
import ServiceRunner from '../utils/service-runner';
import { parseFormData } from '../utils/utils';
// import { closeDatabase } from '../services/rra-osm-p2p';

function handler (params, payload, reply) {
  const now = new Date();
  const name = payload.name;
  const description = payload.description;
  const source = payload.roadNetworkSource;
  const sourceScenarioId = payload.roadNetworkSourceScenario;
  const roadNetworkFile = payload.roadNetworkFile;

  return db('projects')
    .select('status')
    .where('id', params.projId)
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
          .where('project_id', params.projId)
          .then((scenarios) => {
            if (!scenarios.length) throw new ScenarioNotFoundError();
          });
      }
    })
    .then(() => {
      // Create the scenario base to be able to start an operation for it.
      const info = {
        name: name,
        description: description || '',
        status: 'pending',
        master: false,
        project_id: params.projId,
        created_at: now,
        updated_at: now
      };

      return db('scenarios')
        .returning('*')
        .insert(info)
        .catch(err => {
          if (err.constraint === 'scenarios_project_id_name_unique') {
            throw new DataConflictError(`Scenario name already in use for this project: ${name}`);
          }
          throw err;
        })
        .then(scenarios => {
          let scenario = scenarios[0];
          return db.batchInsert('scenarios_settings', [
            {
              scenario_id: scenario.id,
              key: 'res_gen_at',
              value: 0,
              created_at: now,
              updated_at: now
            },
            {
              scenario_id: scenario.id,
              key: 'rn_updated_at',
              value: 0,
              created_at: now,
              updated_at: now
            },
            {
              scenario_id: scenario.id,
              key: 'admin_areas',
              value: '[]',
              created_at: now,
              updated_at: now
            }
          ])
          .then(() => scenario);
        })
        .then(scenario => {
          scenario.data = {
            res_gen_at: 0,
            rn_updated_at: 0
          };
          scenario.admin_areas = '[]';
          return scenario;
        });
    })
    // Start operation and return data to continue.
    .then(scenario => startOperation(params.projId, scenario.id).then(op => [op, scenario]))
    .then(data => {
      let [op, scenario] = data;
      if (source === 'clone') {
        return createScenario(params.projId, scenario.id, op.getId(), source, {sourceScenarioId})
          .then(() => scenario);
      } else if (source === 'new') {
        return handleRoadNetworkUpload(scenario, op.getId(), source, roadNetworkFile)
          .then(() => scenario);
      } else if (source === 'osm') {
        return createScenario(params.projId, scenario.id, op.getId(), source)
          .then(() => scenario);
      }
    })
    .then(scenario => reply(scenario))
    .catch(err => {
      // Delete temp file in case of error. Re-throw error to continue.
      if (roadNetworkFile) {
        removeLocalFile(roadNetworkFile.path, true);
      }
      throw err;
    })
    .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
    .catch(ScenarioNotFoundError, e => reply(Boom.badRequest('Source scenario for cloning not found')))
    .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
    .catch(err => {
      console.log('err', err);
      reply(Boom.badImplementation(err));
    });
}

export default [
  {
    path: '/projects/{projId}/scenarios',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        }
      },
      payload: {
        maxBytes: 1 * Math.pow(1024, 3), // 1GB
        output: 'stream',
        parse: false,
        allow: 'multipart/form-data'
      }
    },
    handler: (request, reply) => {
      parseFormData(request.raw.req)
        .then(result => {
          // Create a payload object to validate.
          let payload = {};
          if (result.fields.name) {
            payload.name = result.fields.name[0];
          }
          if (result.fields.description) {
            payload.description = result.fields.description[0];
          }
          if (result.fields.roadNetworkSource) {
            payload.roadNetworkSource = result.fields.roadNetworkSource[0];
          }
          if (result.fields.roadNetworkSourceScenario) {
            payload.roadNetworkSourceScenario = result.fields.roadNetworkSourceScenario[0];
          }
          if (result.files.roadNetworkFile) {
            payload.roadNetworkFile = result.files.roadNetworkFile[0];
          }

          let validation = Joi.validate(payload, Joi.object().keys({
            name: Joi.string().required(),
            description: Joi.string(),
            roadNetworkSource: Joi.string().valid('clone', 'new', 'osm').required(),
            roadNetworkSourceScenario: Joi.number().when('roadNetworkSource', {is: 'clone', then: Joi.required()}),
            roadNetworkFile: Joi.object().when('roadNetworkSource', {is: 'new', then: Joi.required()})
          }));

          if (validation.error) {
            throw new DataValidationError(validation.error.message);
          }

          return payload;
        })
        .then(payload => handler(request.params, payload, reply))
        .catch(DataValidationError, e => reply(Boom.badRequest(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  },
  {
    path: '/projects/{projId}/scenarios/{scId}/duplicate',
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
      // Recursively search for an available name by appending a (n) suffix
      // to the input value.
      const findName = (name) => {
        let fn = (no) => {
          let n = `${name} (${no})`;
          return db('scenarios')
            .select('id')
            .where('project_id', request.params.projId)
            .where('name', n)
            .first()
            .then(scenario => scenario ? fn(++no) : n);
        };
        return fn(2);
      };

      // Get the name and description from the scenario.
      db('scenarios')
        .select('name', 'description')
        .where('id', request.params.scId)
        .where('project_id', request.params.projId)
        .first()
        .then(scenario => {
          if (!scenario) throw new ScenarioNotFoundError();
          return scenario;
        })
        .then(scenario => {
          // Find next available name.
          return findName(scenario.name)
            .then(name => ({name, description: scenario.description}));
        })
        .then(data => {
          let payload = {
            name: data.name,
            description: data.description,
            roadNetworkSource: 'clone',
            roadNetworkSourceScenario: request.params.scId
          };
          return handler(request.params, payload, reply);
        })
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];

function startOperation (projId, scId) {
  let op = new Operation(db);
  return op.loadByData('scenario-create', projId, scId)
    .then(op => {
      if (op.isStarted()) {
        throw new DataConflictError('Scenario creation already in progress');
      }
    }, err => {
      // In this case if the operation doesn't exist is not a problem.
      if (err.message.match(/not exist/)) { return; }
      throw err;
    })
    .then(() => {
      let op = new Operation(db);
      return op.start('scenario-create', projId, scId)
        .then(() => op.log('start', {message: 'Operation started'}));
    });
}

function createScenario (projId, scId, opId, source, data = {}) {
  let action = Promise.resolve();
  // In test mode we don't want to start the generation.
  // It will be tested in the appropriate place.
  if (process.env.DS_ENV === 'test') { return action; }

  if (source === 'clone') {
    // We need to close the connection to the source scenario before cloning
    // the database. This needs to be done in this process. The process ran by
    // the service runner won't have access to it.
    // action = closeDatabase(projId, data.sourceScenarioId);
  }

  let serviceData = Object.assign({}, {projId, scId, opId, source}, data);

  action.then(() => {
    console.log(`p${projId} s${scId}`, 'createScenario');
    let service = new ServiceRunner('scenario-create', serviceData);

    service.on('complete', err => {
      console.log(`p${projId} s${scId}`, 'createScenario complete');
      if (err) {
        // The operation may not have finished if the error took place outside
        // the promise, or if the error was due to a wrong db connection.
        let op = new Operation(db);
        op.loadById(opId)
          .then(op => {
            if (!op.isCompleted()) {
              return op.log('error', {error: err.message})
                .then(op => op.finish());
            }
          });
      }
    })
    .start();
  });

  return action;
}

// Upload the file to S3
function handleRoadNetworkUpload (scenario, opId, source, roadNetworkFile) {
  const type = 'road-network';
  const fileName = `${type}_${Date.now()}`;
  const filePath = `scenario-${scenario.id}/${fileName}`;

  return Promise.resolve()
    .then(() => {
      // TODO: Perform needed validations.
    })
    // Upload to S3.
    .then(() => putFileToS3(filePath, roadNetworkFile.path))
    // Delete temp file.
    .then(() => removeLocalFile(roadNetworkFile.path, true))
    .then(() => createScenario(scenario.project_id, scenario.id, opId, source, {roadNetworkFile: fileName}));
}
