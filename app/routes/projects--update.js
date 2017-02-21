'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';

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
        created_at: (new Date())
      };

      typeof data.name !== 'undefined' && (update.name = data.name);
      typeof data.description !== 'undefined' && (update.description = data.description);

      db('projects')
      .returning('*')
      .update(update)
      .where('id', request.params.projId)
      .then(res => res.length
        ? reply(res[0])
        : reply(Boom.notFound('Project not found'))
      )
      .catch(err => {
        if (err.constraint === 'projects_name_unique') {
          return reply(Boom.conflict(`Project name already in use: ${data.name}`));
        }
        console.error(err);
        return reply(Boom.badImplementation(err));
      });
    }
  }
];
