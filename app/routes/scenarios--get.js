'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { ScenarioNotFoundError, ProjectNotFoundError } from '../utils/errors';
import { getSourceData, getOperationData } from '../utils/utils';

const routeSingleScenarioConfig = {
  validate: {
    params: {
      projId: Joi.number(),
      scId: Joi.number()
    }
  }
};

export default [
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
        db.select('id').from('scenarios').where('project_id', request.params.projId).orderBy('created_at').offset(offset).limit(limit)
      ]).then(res => {
        const [count, scenarios] = res;
        return Promise.map(scenarios, s => loadScenario(request.params.projId, s.id))
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

export function loadScenario (projId, scId) {
  return db.select('*')
    .from('scenarios')
    .where('id', scId)
    .where('project_id', projId)
    .orderBy('created_at')
    .first()
    .then(scenario => {
      if (!scenario) throw new ScenarioNotFoundError();
      return scenario;
    })
    .then(scenario => attachAdminAreas(scenario))
    .then(scenario => attachScenarioSettings(scenario))
    .then(scenario => attachScenarioSourceData(scenario))
    .then(scenario => attachOperation('generate-analysis', 'gen_analysis', scenario))
    .then(scenario => attachOperation('scenario-create', 'scen_create', scenario));
}

function singleScenarioHandler (request, reply) {
  loadScenario(request.params.projId, request.params.scId)
    .then(scenario => reply(scenario))
    .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
    .catch(err => {
      console.log('err', err);
      reply(Boom.badImplementation(err));
    });
}

function attachScenarioSettings (scenario) {
  return db.select('key', 'value')
    .from('scenarios_settings')
    // Admin areas are handled differently because the name has to be
    // fetched as well.
    .whereNotIn('key', ['admin_areas'])
    .where('scenario_id', scenario.id)
    .then(data => {
      scenario.data = {};
      data.forEach(o => {
        scenario.data[o.key] = parseType(o.value);
      });
      return scenario;
    });
}

function parseType (val) {
  // Quick and dirty way to parse type.
  // Using JSON.parse will parse every value except strings. So if the parsing
  // fails assume it's a string and carry on.
  try {
    return JSON.parse(val);
  } catch (e) {
    return val;
  }
}

function attachScenarioSourceData (scenario) {
  return getSourceData(db, 'scenario', scenario.id)
    .then(sourceData => {
      scenario.sourceData = sourceData;
      return scenario;
    });
}

function attachAdminAreas (scenario) {
  return Promise.all([
    // Get admin areas.
    db('projects_aa')
      .select('id', 'name', 'type')
      .where('project_id', scenario.project_id),
    // Get selected ids.
    db('scenarios_settings')
      .select('value')
      .where('key', 'admin_areas')
      .where('scenario_id', scenario.id)
      .first()
  ])
  .then(data => {
    let [aa, selected] = data;

    if (!aa.length) {
      scenario.admin_areas = null;
    } else {
      selected = selected ? JSON.parse(selected.value) : [];

      // Mark selected as selected.
      aa = aa.map(o => {
        o.selected = selected.indexOf(o.id) !== -1;
        return o;
      }).sort((a, b) => a.id - b.id);
      scenario.admin_areas = aa;
    }

    return scenario;
  });
}

function attachOperation (opName, prop, scenario) {
  return getOperationData(db, opName, scenario.id)
    .then(opData => {
      scenario[prop] = opData;
      return scenario;
    });
}
