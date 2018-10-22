'use strict';
import Joi from 'joi';

import db from '../db/';

import { ProjectNotFoundError, DataConflictError, getBoomResponseForError } from '../utils/errors';

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
      .catch(err => reply(getBoomResponseForError(err)));
    }
  }
];
