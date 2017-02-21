'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../services/db';

module.exports = [
  {
    path: '/projects',
    method: 'POST',
    config: {
      validate: {
        payload: {
          name: Joi.string().required(),
          description: Joi.string()
        }
      }
    },
    handler: (request, reply) => {
      const data = request.payload;
      const timestamps = {
        created_at: (new Date()),
        updated_at: (new Date())
      };
      db('projects')
      .returning('*')
      .insert(Object.assign({}, data, timestamps))
      .then(reply)
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
