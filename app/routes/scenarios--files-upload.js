'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { putFile as putFileToS3, removeLocalFile } from '../s3/utils';
import { ProjectNotFoundError, ScenarioNotFoundError, FileExistsError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/scenarios/{scId}/files',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        },
        payload: {
          type: Joi.valid('road-network', 'poi').required(),
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
      const scId = parseInt(request.params.scId);

      const fileName = `${type}_${Date.now()}`;
      const filePath = `scenario-${scId}/${fileName}`;

      // Check that the project exists.
      // Check that the scenario exists.
      // Check that a file for this type doesn't exist already.
      db('projects')
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
            .andOn(db.raw('scenarios_files.type = :type', {type}));
        })
        .where('projects.id', projId)
        .then(res => {
          if (!res.length) throw new ProjectNotFoundError();
          if (res[0].scenario_id == null) throw new ScenarioNotFoundError();
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
            scenario_id: scId,
            created_at: (new Date()),
            updated_at: (new Date())
          };

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
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(FileExistsError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
