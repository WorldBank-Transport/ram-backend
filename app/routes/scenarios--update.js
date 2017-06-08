'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { loadScenario } from './scenarios--get';
import { ScenarioNotFoundError, DataConflictError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/scenarios/{scId}',
    method: 'PATCH',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        },
        payload: {
          name: Joi.string(),
          description: Joi.alternatives().try(Joi.valid(null), Joi.string()),
          selectedAdminAreas: Joi.array()
        }
      }
    },
    handler: (request, reply) => {
      const data = request.payload;
      let update = {
        updated_at: (new Date())
      };

      typeof data.name !== 'undefined' && (update.name = data.name);
      typeof data.description !== 'undefined' && (update.description = data.description);

      let executor = Promise.resolve(update);

      if (typeof data.selectedAdminAreas !== 'undefined') {
        // Get all the admin areas ids to perform some validation.
        executor = db('projects_aa')
          .select('id')
          .where('project_id', request.params.projId)
          .then(aa => aa.filter(o => data.selectedAdminAreas
            .indexOf(o.id) !== -1)
            .map(o => o.id)
          )
          // Store the selected admin areas in the settings table as an array.
          .then(adminAreas => db('scenarios_settings')
            .update({ value: JSON.stringify(adminAreas) })
            .where('key', 'admin_areas')
            .where('scenario_id', request.params.scId)
          );
      }

      executor
        .then(() => db('scenarios')
          .returning('id')
          .update(update)
          .where('id', request.params.scId)
          .where('project_id', request.params.projId)
        )
        .then(scenarios => {
          if (!scenarios.length) throw new ScenarioNotFoundError();
          return scenarios[0];
        })
        .then(scenarioId => loadScenario(request.params.projId, scenarioId))
        .then(scenario => db('projects').update({updated_at: (new Date())}).where('id', request.params.projId).then(() => scenario))
        .then(scenario => reply(scenario))
        .catch(err => {
          if (err.constraint === 'scenarios_project_id_name_unique') {
            throw new DataConflictError(`Scenario name already in use for this project: ${data.name}`);
          }
          throw err;
        })
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
