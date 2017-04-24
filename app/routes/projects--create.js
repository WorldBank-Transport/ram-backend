'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';

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
      const base = {
        status: 'pending',
        created_at: (new Date()),
        updated_at: (new Date())
      };

      db('projects')
      .returning('*')
      .insert(Object.assign({}, data, base))
      .then(res => {
        const projectData = res[0];

        // Create first scenario. This is needed to store the related files.
        db('scenarios')
        .insert({
          name: 'Main scenario',
          project_id: projectData.id,
          status: 'pending',
          master: true,
          created_at: (new Date()),
          updated_at: (new Date()),
          data: {
            res_gen_at: 0,
            rn_updated_at: 0
          }
        })
        .then(() => reply(projectData))
        .catch(err => reply(Boom.badImplementation(err)));
      })
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
