'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { getPresignedUrl, listenForFile } from '../s3/utils';
import { ProjectNotFoundError, FileExistsError } from '../utils/errors';

// The upload is done directly to the storage bucket.
// This endpoint just provides the presigned url, and listens for the upload
// completion to insert it in the database.
module.exports = [
  {
    path: '/projects/{projId}/upload',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        query: {
          type: Joi.valid('profile', 'villages', 'admin-bounds').required()
        }
      }
    },
    handler: (request, reply) => {
      const type = request.query.type;
      const projId = parseInt(request.params.projId);

      const fileName = `${type}_${Date.now()}`;
      const filePath = `project-${projId}/${fileName}`;

      // Check that the project exists.
      // Check that a file for this type doesn't exist already.
      let dbChecks = db('projects')
        .select('projects.id', 'projects.name as project_name', 'projects_files.name as filename')
        .leftJoin('projects_files', function () {
          this.on('projects.id', '=', 'projects_files.project_id')
            .andOn(db.raw('projects_files.type = :type', {type}));
        })
        .where('projects.id', projId)
        .then(res => {
          if (!res.length) throw new ProjectNotFoundError();
          if (res[0].filename !== null) throw new FileExistsError();
          return res[0].id;
        });

      dbChecks
        .then(() => getPresignedUrl(filePath))
        .then(presignedUrl => reply({
          fileName: fileName,
          presignedUrl
        }))
        .then(() => listenForFile(filePath))
        .then(record => {
          let data = {
            name: fileName,
            type: type,
            path: filePath,
            project_id: projId,
            created_at: (new Date()),
            updated_at: (new Date())
          };

          db('projects_files')
            .returning('*')
            .insert(data)
            .then(res => {
              console.log('res', res);
            })
            .catch(err => {
              console.log('err', err);
            });
        })
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(FileExistsError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
