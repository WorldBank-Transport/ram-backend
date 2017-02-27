'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { removeFile } from '../s3/utils';
import {
  ProjectNotFoundError,
  ScenarioNotFoundError,
  FileNotFoundError,
  ProjectStatusError
} from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/scenarios/{scId}/files/{fileId}',
    method: 'DELETE',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        }
      }
    },
    handler: (request, reply) => {
      db('scenarios')
        .select('scenarios.id',
          'projects.status as project_status',
          'projects.id as project_id',
          'scenarios_files.path as file_path',
          'scenarios_files.id as file_id')
        .leftJoin('projects', function () {
          this.on('projects.id', '=', 'scenarios.project_id')
            .andOn(db.raw('projects.id = :projId', {projId: request.params.projId}));
        })
        .leftJoin('scenarios_files', function () {
          this.on('scenarios.id', '=', 'scenarios_files.project_id')
            .andOn(db.raw('scenarios_files.id = :fileId', {fileId: request.params.fileId}));
        })
        .where('scenarios.id', request.params.scId)
        .then(res => {
          if (!res.length) throw new ScenarioNotFoundError();
          let data = res[0];
          if (data.project_id === null) throw new ProjectNotFoundError();
          if (data.project_status !== 'pending') throw new ProjectStatusError('Project no longer in the setup phase. Files can not be removed');
          if (data.file_id === null) throw new FileNotFoundError();

          return db('scenarios_files')
            .where('id', data.file_id)
            .del()
            .then(() => removeFile(data.file_path));
        })
        .then(() => reply({statusCode: 200, message: 'File deleted'}))
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(ProjectStatusError, e => reply(Boom.badRequest(e.message)))
        .catch(FileNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
