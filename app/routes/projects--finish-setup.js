'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

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
                .where('project_id', project.id)
                .where('master', true)
            ]);
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
