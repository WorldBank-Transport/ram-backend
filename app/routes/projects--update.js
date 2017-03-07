'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';

import { ProjectNotFoundError, DataConflictError } from '../utils/errors';
import { getProject } from './projects--get';

module.exports = [
  {
    path: '/projects/{projId}',
    method: 'PATCH',
    config: {
      validate: {
        params: {
          projId: Joi.number()
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

      db('projects')
      .returning('*')
      .update(update)
      .where('id', request.params.projId)
      .then(projects => {
        if (!projects.length) throw new ProjectNotFoundError();
        return projects[0];
      })
      .then(project => reply(project))
      .catch(err => {
        if (err.constraint === 'projects_name_unique') {
          throw new DataConflictError(`Project name already in use: ${data.name}`);
        }
        throw err;
      })
      .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
      .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
      .catch(err => {
        console.log('err', err);
        reply(Boom.badImplementation(err));
      });
    }
  },
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
          // Main scenario id.
          return db.select('id')
            .from('scenarios')
            .where('project_id', project.id)
            .orderBy('created_at')
            .limit(1)
            .then(res => db.transaction(function (trx) {
              let scenarioId = res[0].id;

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
                  .where('id', scenarioId)
              ]);
            }));
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
