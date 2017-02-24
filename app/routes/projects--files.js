'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import s3 from '../s3/';
import { ProjectNotFoundError, ScenarioNotFoundError, FileExistsError } from '../utils/errors';

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
          if (!res.length) throw new ProjectNotFoundError('Project not found');
          if (res[0].filename !== null) throw new FileExistsError('File already exists');
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
          if (!res.length) throw new ProjectNotFoundError('Project not found');
          if (res[0].scenario_id == null) throw new ScenarioNotFoundError('Scenario not found');
          if (res[0].filename !== null) throw new FileExistsError('File already exists');
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
  }
];

function getPresignedUrl (file) {
  return new Promise((resolve, reject) => {
    s3.presignedPutObject('rra', file, 24 * 60 * 60, function (err, presignedUrl) {
      if (err) {
        return reject(err);
      }
      return resolve(presignedUrl);
    });
  });
}

function listenForFile (file) {
  return new Promise((resolve, reject) => {
    var listener = s3.listenBucketNotification('rra', file, '', ['s3:ObjectCreated:*']);
    listener.on('notification', function (record) {
      listener.stop();
      return resolve(record);
    });
  });
}
