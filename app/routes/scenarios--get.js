'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { ScenarioNotFoundError, ProjectNotFoundError } from '../utils/errors';

const routeSingleScenarioConfig = {
  validate: {
    params: {
      projId: Joi.number(),
      scId: Joi.number()
    }
  }
};

module.exports = [
  {
    path: '/projects/{projId}/scenarios',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        }
      }
    },
    handler: (request, reply) => {
      let {page, limit} = request;
      let offset = (page - 1) * limit;

      Promise.all([
        db('scenarios').where('project_id', request.params.projId).count('id'),
        db.select('*').from('scenarios').where('project_id', request.params.projId).orderBy('created_at').offset(offset).limit(limit)
      ]).then(res => {
        const [count, scenarios] = res;
        return Promise.map(scenarios, s => attachScenarioFiles(s)
            .then(s => attachOperation('generate-analysis', 'gen_analysis', s))
            .then(s => attachOperation('scenario-create', 'scen_create', s))
          )
          .then(scenarios => {
            request.count = parseInt(count[0].count);
            reply(scenarios);
          });
      });
    }
  },
  {
    path: '/projects/{projId}/scenarios/0',
    method: 'GET',
    config: routeSingleScenarioConfig,
    handler: (request, reply) => {
      db('scenarios')
        .select('id')
        .where('project_id', request.params.projId)
        .where('master', true)
        .then(res => {
          if (!res.length) throw new ProjectNotFoundError();
          return res[0].id;
        })
        .then(id => {
          request.params.scId = id;
          singleScenarioHandler(request, reply);
        })
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  },
  {
    path: '/projects/{projId}/scenarios/{scId}',
    method: 'GET',
    config: routeSingleScenarioConfig,
    handler: singleScenarioHandler
  }
];

function singleScenarioHandler (request, reply) {
  db.select('*')
    .from('scenarios')
    .where('id', request.params.scId)
    .where('project_id', request.params.projId)
    .orderBy('created_at')
    .then(scenarios => {
      if (!scenarios.length) throw new ScenarioNotFoundError();
      return scenarios[0];
    })
    .then(scenario => attachScenarioFiles(scenario))
    .then(scenario => attachOperation('generate-analysis', 'gen_analysis', scenario))
    .then(scenario => attachOperation('scenario-create', 'scen_create', scenario))
    .then(scenario => reply(scenario))
    .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
    .catch(err => {
      console.log('err', err);
      reply(Boom.badImplementation(err));
    });
}

function attachScenarioFiles (scenario) {
  return db.select('id', 'name', 'type', 'path', 'created_at')
    .from('scenarios_files')
    .where('scenario_id', scenario.id)
    .then(files => {
      scenario.files = files || [];
      return scenario;
    });
}

function attachOperation (opName, prop, scenario) {
  return db.select('*')
    .from('operations')
    .where('operations.scenario_id', scenario.id)
    .where('operations.name', opName)
    .orderBy('created_at', 'desc')
    .limit(1)
    .then(op => {
      if (!op.length) {
        scenario[prop] = null;
        return scenario;
      }
      op = op[0];

      return db.select('*')
        .from('operations_logs')
        .where('operation_id', op.id)
        .orderBy('created_at')
        .then(logs => {
          let errored = false;
          if (logs.length) {
            errored = logs[logs.length - 1].code === 'error';
          }
          scenario[prop] = {
            id: op.id,
            status: op.status,
            created_at: op.created_at,
            updated_at: op.updated_at,
            errored,
            logs: logs.map(l => ({
              id: l.id,
              code: l.code,
              data: l.data,
              created_at: l.created_at
            }))
          };
          return scenario;
        });
    });
}
