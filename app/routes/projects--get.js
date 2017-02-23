'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';

module.exports = [
  {
    path: '/projects',
    method: 'GET',
    handler: (request, reply) => {
      let {page, limit} = request;
      let offset = (page - 1) * limit;

      Promise.all([
        db('projects').count('id'),
        db.select('*').from('projects').offset(offset).limit(limit)
      ]).then(res => {
        const [count, projects] = res;
        request.count = parseInt(count[0].count);
        reply(projects);
      });
    }
  },
  {
    path: '/projects/{projId}',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        }
      }
    },
    handler: (request, reply) => {
      db.select('*').from('projects').where('id', request.params.projId)
      .then(res => res.length
        ? reply(res[0])
        : reply(Boom.notFound('Project not found'))
      );
    }
  }
];
