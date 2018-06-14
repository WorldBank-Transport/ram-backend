'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { removeDir as removeS3Dir } from '../s3/utils';
import { MasterScenarioError, ScenarioNotFoundError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/scenarios/{scId}',
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
      const {projId, scId} = request.params;

      // Check for the master scenario. That one can't be deleted.
      db('scenarios')
        .select('*')
        .where('id', scId)
        .where('project_id', projId)
        .then(res => {
          if (!res.length) {
            throw new ScenarioNotFoundError();
          }
          if (res[0].master) {
            throw new MasterScenarioError('The master scenario of a project can not be deleted');
          }
        })
        .then(() => db.transaction(trx => {
          return trx
            .select('*')
            .from('scenarios_files')
            .where('scenario_id', scId)
            .where('project_id', projId)
            // Delete the scenario. Everything else will follow due to
            // cascade delete.
            // - scenario files
            // - operations
            // - operation logs
            .then(() => trx.delete().from('scenarios').where('id', scId).where('project_id', projId))
            .then(res => {
              if (res <= 0) {
                throw new ScenarioNotFoundError();
              }
            })
            .then(() => db('projects').update({updated_at: (new Date())}).where('id', request.params.projId))
            .then(() => {
              // Let the dir be removed in the background.
              removeS3Dir(`scenario-${scId}/`);
            });
        }))
      .then(() => reply({statusCode: 200, message: 'Scenario deleted'}))
      .catch(MasterScenarioError, e => reply(Boom.conflict(e.message)))
      .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
      .catch(err => {
        console.log('err', err);
        reply(Boom.badImplementation(err));
      });
    }
  }
];
