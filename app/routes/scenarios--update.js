'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';

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
          description: Joi.alternatives().try(Joi.valid(null), Joi.string())
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

      db('scenarios')
      .returning('*')
      .update(update)
      .where('id', request.params.scId)
      .where('project_id', request.params.projId)
      .then(scenarios => {
        if (!scenarios.length) throw new ScenarioNotFoundError();
        return scenarios[0];
      })
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
