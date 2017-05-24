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
      const now = new Date();
      const data = request.payload;
      const base = {
        status: 'pending',
        created_at: now,
        updated_at: now
      };

      db('projects')
      .returning('*')
      .insert(Object.assign({}, data, base))
      .then(projectData => {
        projectData = projectData[0];
        // Create first scenario. This is needed to store the related files.
        return db('scenarios')
        .returning('*')
        .insert({
          name: 'Main scenario',
          project_id: projectData.id,
          status: 'pending',
          master: true,
          created_at: now,
          updated_at: now
        })
        .then(scenarioData => {
          scenarioData = scenarioData[0];
          return db.batchInsert('scenarios_settings', [
            {
              scenario_id: scenarioData.id,
              key: 'res_gen_at',
              value: 0,
              created_at: now,
              updated_at: now
            },
            {
              scenario_id: scenarioData.id,
              key: 'rn_updated_at',
              value: 0,
              created_at: now,
              updated_at: now
            }
          ]);
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
