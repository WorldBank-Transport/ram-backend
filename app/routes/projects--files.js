'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { getPresignedUrl, listenForFile, removeFile } from '../s3/utils';
import {
  ProjectNotFoundError,
  ScenarioNotFoundError,
  FileExistsError,
  FileNotFoundError,
  ProjectStatusError
} from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/upload',
    method: 'GET',
    config: {
      validate: {
        query: {
          type: Joi.valid('profile', 'villages', 'admin-bounds')
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
        .catch(ProjectNotFoundError, () => reply(Boom.notFound('Project not found')))
        .catch(FileExistsError, () => reply(Boom.conflict('File already exists.')))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  },

  {
    path: '/projects/{projId}/scenarios/{scId}/upload',
    method: 'GET',
    config: {
      validate: {
        query: {
          type: Joi.valid('road-network', 'poi')
        }
      }
    },
    handler: (request, reply) => {
      const type = request.query.type;
      const projId = parseInt(request.params.projId);
      const scId = parseInt(request.params.scId);

      const fileName = `${type}_${Date.now()}`;
      const filePath = `scenario-${scId}/${fileName}`;

      // Check that the project exists.
      // Check that the scenario exists.
      // Check that a file for this type doesn't exist already.
      let dbChecks = db('projects')
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
          this.on('scenarios.id', '=', 'scenarios_files.project_id')
            .andOn(db.raw('scenarios_files.type = :type', {type}));
        })
        .where('projects.id', projId)
        .then(res => {
          if (!res.length) throw new ProjectNotFoundError();
          if (res[0].scenario_id == null) throw new ScenarioNotFoundError();
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
          // TODO: the "road network" will have to be processed differently.

          let data = {
            name: fileName,
            type: type,
            path: filePath,
            project_id: projId,
            scenario_id: scId,
            created_at: (new Date()),
            updated_at: (new Date())
          };

          db('scenarios_files')
          .returning('*')
          .insert(data)
          .then(res => {
            console.log('res', res);
          })
          .catch(err => {
            console.log('err', err);
          });
        })
        .catch(ProjectNotFoundError, () => reply(Boom.notFound('Project not found')))
        .catch(ScenarioNotFoundError, () => reply(Boom.notFound('Scenario not found')))
        .catch(FileExistsError, () => reply(Boom.conflict('File already exists.')))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  },

  {
    path: '/projects/{projId}/files/{fileId}',
    method: 'DELETE',
    config: {
      validate: {
        query: {
        }
      }
    },
    handler: (request, reply) => {
      db('projects')
        .select('projects.id',
          'projects.status',
          'projects_files.path as file_path',
          'projects_files.id as file_id')
        .leftJoin('projects_files', function () {
          this.on('projects.id', '=', 'projects_files.project_id')
            .andOn(db.raw('projects_files.id = :fileId', {fileId: request.params.fileId}));
        })
        .where('projects.id', request.params.projId)
        .then(res => {
          if (!res.length) throw new ProjectNotFoundError();
          let data = res[0];
          if (data.status !== 'pending') throw new ProjectStatusError();
          if (data.file_id === null) throw new FileNotFoundError();

          return db('projects_files')
            .where('id', data.file_id)
            .del()
            .then(() => removeFile(data.path));
        })
        .then(() => reply({statusCode: 200, message: 'File deleted'}))
        .catch(ProjectNotFoundError, () => reply(Boom.notFound('Project not found')))
        .catch(ProjectStatusError, () => reply(Boom.badRequest('Project no longer in the setup phase. Files can not be removed')))
        .catch(FileNotFoundError, () => reply(Boom.notFound('File not found.')))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  },

  {
    path: '/projects/{projId}/scenarios/{scId}/files/{fileId}',
    method: 'DELETE',
    config: {
      validate: {
        query: {
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
          if (data.project_status !== 'pending') throw new ProjectStatusError();
          if (data.file_id === null) throw new FileNotFoundError();

          return db('scenarios_files')
            .where('id', data.file_id)
            .del()
            .then(() => removeFile(data.file_path));
        })
        .then(() => reply({statusCode: 200, message: 'File deleted'}))
        .catch(ScenarioNotFoundError, () => reply(Boom.notFound('Scenario not found')))
        .catch(ProjectNotFoundError, () => reply(Boom.notFound('Project not found')))
        .catch(ProjectStatusError, () => reply(Boom.badRequest('Project no longer in the setup phase. Files can not be removed')))
        .catch(FileNotFoundError, () => reply(Boom.notFound('File not found.')))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
