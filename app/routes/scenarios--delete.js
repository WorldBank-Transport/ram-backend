'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { removeFile } from '../s3/utils';
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
          // Store the files to delete later. Not super clean but better than
          // just passing the files down all the promises.
          let allFiles;

          return trx
            .select('*')
            .from('scenarios_files')
            .where('scenario_id', scId)
            .where('project_id', projId)
            .then(files => { allFiles = files; })
            // Delete files from tables. Needs to be done first because of the
            // foreign keys.
            .then(() => trx.delete().from('scenarios_files').where('scenario_id', scId).where('project_id', projId))
            .then(() => trx.delete().from('scenarios').where('id', scId).where('project_id', projId))
            .then(res => {
              if (res <= 0) {
                throw new ScenarioNotFoundError();
              }
            })
            .then(() => {
              return Promise.map(allFiles, f => removeFile(f.path));
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
