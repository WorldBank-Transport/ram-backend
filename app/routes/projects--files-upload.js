'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { putFile as putFileToS3, removeLocalFile } from '../s3/utils';
import { ProjectNotFoundError, FileExistsError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/files',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        payload: {
          type: Joi.valid('profile', 'villages', 'admin-bounds').required(),
          file: Joi.object().keys({
            filename: Joi.string(),
            path: Joi.string(),
            headers: Joi.object(),
            bytes: Joi.number()
          }).required()
        }
      },
      payload: {
        maxBytes: 1 * Math.pow(1024, 3), // 1GB
        output: 'file',
        parse: true
      }
    },
    handler: (request, reply) => {
      const { type, file } = request.payload;
      const projId = parseInt(request.params.projId);

      const fileName = `${type}_${Date.now()}`;
      const filePath = `project-${projId}/${fileName}`;

      // Check that the project exists.
      // Check that a file for this type doesn't exist already.
      db('projects')
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
        })
        .then(() => {
          // TODO: Perform needed validations.
        })
        // Upload to S3.
        .then(() => putFileToS3(filePath, file.path))
        // Insert into database.
        .then(() => {
          let data = {
            name: fileName,
            type: type,
            path: filePath,
            project_id: projId,
            created_at: (new Date()),
            updated_at: (new Date())
          };

          return db('projects_files')
            .returning('*')
            .insert(data)
            .then(() => db('projects').update({updated_at: (new Date())}).where('id', projId));
        })
        // Delete temp file.
        .then(() => removeLocalFile(file.path, true))
        // .then(() => {
        //   return new Promise(resolve => setTimeout(() => resolve(), 5000));
        // })
        .then(() => reply({
          fileName: fileName
        }))
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(FileExistsError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          // Delete temp file.
          removeLocalFile(file.path, true);
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
