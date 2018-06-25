'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { ProjectNotFoundError, DataConflictError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/rah-export',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        payload: {
          title: Joi.string().required(),
          country: Joi.string().required(),
          date: Joi.date().required(),
          description: Joi.string().required(),
          authors: Joi.array().items(
            Joi.object().keys({
              id: Joi.string(),
              name: Joi.string().required()
            })
          ).required(),
          topics: Joi.array().items(
            Joi.object().keys({
              id: Joi.string(),
              name: Joi.string().required()
            })
          ).required(),
          contactName: Joi.string().required(),
          contactEmail: Joi.string().email().required()
        }
      }
    },
    handler: (request, reply) => {
      return db('projects')
        .select('status')
        .where('id', request.params.projId)
        .then(projects => {
          if (!projects.length) throw new ProjectNotFoundError();
          //  It's not possible export pending projects.
          if (projects[0].status === 'pending') throw new DataConflictError('Project setup not completed');
        })
        .then(() => {
          reply({ok: 'ok'});
        })
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
