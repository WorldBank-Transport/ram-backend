'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { removeFile } from '../s3/utils';
import { ProjectNotFoundError } from '../utils/errors';

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
        // Store the files to delete later. Not super clean but better than
        // just passing the files down all the promises.
        let allFiles;
        return Promise.all([
          trx.select('*').from('projects_files').where('project_id', id),
          trx.select('*').from('scenarios_files').where('project_id', id)
        ])
        .then(files => { allFiles = files; })
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
          let flat = allFiles.reduce((files, acc) => acc.concat(files), []);
          return Promise.map(flat, f => removeFile(f.path));
        });
      })
      .then(() => reply({statusCode: 200, message: 'Project deleted'}))
      .catch(ProjectNotFoundError, () => reply(Boom.notFound('Project not found')))
      .catch(err => {
        console.log('err', err);
        reply(Boom.badImplementation(err));
      });
    }
  }
];
