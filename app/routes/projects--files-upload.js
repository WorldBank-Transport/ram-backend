'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { putFile as putFileToS3, removeLocalFile } from '../s3/utils';
import { ProjectNotFoundError, FileExistsError, DataValidationError } from '../utils/errors';
import { parseFormData } from '../utils/utils';

module.exports = [
  {
    path: '/projects/{projId}/files',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        }
      },
      payload: {
        // maxBytes: 1 * Math.pow(1024, 3), // 1GB
        maxBytes: 1,
        output: 'stream',
        parse: false,
        allow: 'multipart/form-data'
      }
    },
    handler: (request, reply) => {
      return reply(Boom.notImplemented('This method is deprecated'));

      const projId = parseInt(request.params.projId);
      let file;
      let type;
      let fileName;
      let filePath;

      parseFormData(request.raw.req)
        .then(result => {
          if (!result.fields.type) {
            throw new DataValidationError('"type" is required');
          }

          type = result.fields.type[0];

          let allowedTypes = ['profile', 'origins', 'admin-bounds'];
          if (allowedTypes.indexOf(type) === -1) {
            throw new DataValidationError(`"type" must be one of [${allowedTypes.join(', ')}]`);
          }

          if (!result.files.file) {
            throw new DataValidationError('"file" is required');
          }

          file = result.files.file[0];
          fileName = `${type}_${Date.now()}`;
          filePath = `project-${projId}/${fileName}`;
        })
        // Check that the project exists.
        // Check that a file for this type doesn't exist already.
        .then(() => db('projects')
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
        )
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

          if (type === 'origins') {
            // When uploading an origins file, the user has to specify
            // what attributes have population data, and a label for them.
            // This will later be used for running analysis on subgroups
            // of population.
            // TODO: Get the values from the form.
            data.data = JSON.stringify({
              indicators: [
                {
                  key: 'population',
                  label: 'Total population'
                }
              ]
            });
          }

          return db('projects_files')
            .returning('*')
            .insert(data)
            .then(() => db('projects').update({updated_at: (new Date())}).where('id', projId));
        })
        // Delete temp file.
        .then(() => removeLocalFile(file.path, true))
        .then(() => reply({
          fileName: fileName
        }))
        .catch(err => {
          // Delete temp file in case of error. Re-throw error to continue.
          file && removeLocalFile(file.path, true);
          throw err;
        })
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(FileExistsError, e => reply(Boom.conflict(e.message)))
        .catch(DataValidationError, e => reply(Boom.badRequest(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
