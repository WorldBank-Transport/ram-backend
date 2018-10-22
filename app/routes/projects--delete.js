'use strict';
import Joi from 'joi';

import db from '../db/';
import { removeDir as removeS3Dir } from '../s3/utils';
import { ProjectNotFoundError, getBoomResponseForError } from '../utils/errors';

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
      const id = request.params.projId;
      db.transaction(trx => {
        return trx.select('id').from('scenarios').where('project_id', id)
        .then(scenarios => {
          // Let the dir be removed in the background.
          scenarios.forEach(s => removeS3Dir(`scenario-${s.id}/`));
        })
        // Delete the project. Everything else will follow due to
        // cascade delete.
        // - project files
        // - scenario
        // - scenario files
        // - operations
        // - operation logs
        .then(() => trx
          .delete()
          .from('projects')
          .where('id', id)
          .then(res => {
            if (res <= 0) {
              throw new ProjectNotFoundError();
            }
          })
        )
        .then(() => {
          // Let the dir be removed in the background.
          removeS3Dir(`project-${id}/`);
        });
      })
      .then(() => reply({statusCode: 200, message: 'Project deleted'}))
      .catch(err => reply(getBoomResponseForError(err)));
    }
  }
];
