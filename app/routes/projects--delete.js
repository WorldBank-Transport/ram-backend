'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../services/db';

module.exports = [
  {
    path: '/projects/{projId}',
    method: 'DELETE',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        }
      }
    },
    handler: (request, reply) => {
      // TODO: Delete all scenarios, when the parent project gets deleted.
      const id = request.params.projId;
      db('projects')
        .where('id', id)
        .del()
        .then(res => {
          if (res > 0) {
            return reply({statusCode: 200, message: 'Project deleted'});
          } else {
            return reply(Boom.notFound('Project not found'));
          }
        })
        .catch(err => {
          console.error(err);
          return reply(Boom.badImplementation(err));
        });
    }
  }
];
