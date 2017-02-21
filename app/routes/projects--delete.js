'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';

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
        .then(res => res > 0
          ? reply({statusCode: 200, message: 'Project deleted'})
          : reply(Boom.notFound('Project not found'))
        )
        .catch(err => {
          console.error(err);
          return reply(Boom.badImplementation(err));
        });
    }
  }
];
