'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { putFile as putFileToS3, removeLocalFile } from '../s3/utils';
import { ProjectNotFoundError, ScenarioNotFoundError, FileExistsError, DataValidationError } from '../utils/errors';
import { parseFormData } from '../utils/utils';

module.exports = [
  {
    path: '/projects/{projId}/scenarios/{scId}/files',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
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

      /* eslint-disable */
      const projId = parseInt(request.params.projId);
      const scId = parseInt(request.params.scId);
      let file;
      let type;
      let subtype;
      let fileName;
      let filePath;

      parseFormData(request.raw.req)
        .then(result => {
          if (!result.fields.type) {
            throw new DataValidationError('"type" is required');
          }

          type = result.fields.type[0];

          let allowedTypes = ['road-network', 'poi'];
          if (allowedTypes.indexOf(type) === -1) {
            throw new DataValidationError(`"type" must be one of [${allowedTypes.join(', ')}]`);
          }

          if (!result.files.file) {
            throw new DataValidationError('"file" is required');
          }

          // TODO: Get subtype from request.
          subtype = type === 'poi' ? 'pointOfInterest' : '';

          file = result.files.file[0];
          fileName = `${type}_${Date.now()}`;
          filePath = `scenario-${scId}/${fileName}`;
        })
        // Check that the project exists.
        // Check that the scenario exists.
        // Check that a file for this type doesn't exist already.
        .then(() => db('projects')
          .select('projects.id',
            'projects.name as project_name',
            'scenarios.id as scenario_id',
            'scenarios.name as scenario_name',
            'scenarios_files.name as filename')
          .leftJoin('scenarios', function () {
            this.on('projects.id', '=', 'scenarios.project_id')
              .andOn(db.raw('scenarios.id = :scId', {scId}));
          })
          .leftJoin('scenarios_files', function () {
            this.on('scenarios.id', '=', 'scenarios_files.scenario_id')
              .andOn(db.raw('scenarios_files.type = :type', {type}))
              .andOn(db.raw('scenarios_files.subtype = :subtype', {subtype}));
          })
          .where('projects.id', projId)
          .then(res => {
            if (!res.length) throw new ProjectNotFoundError();
            if (res[0].scenario_id == null) throw new ScenarioNotFoundError();
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
            scenario_id: scId,
            created_at: (new Date()),
            updated_at: (new Date())
          };

          // TODO: Get subtype from request.
          if (type === 'poi') {
            data.subtype = subtype;
          }

          return db('scenarios_files')
            .returning('*')
            .insert(data)
            .then(() => db('scenarios').update({updated_at: (new Date())}).where('id', scId))
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
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(FileExistsError, e => reply(Boom.conflict(e.message)))
        .catch(DataValidationError, e => reply(Boom.badRequest(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
