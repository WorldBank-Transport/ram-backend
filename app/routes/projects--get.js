'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { ProjectNotFoundError } from '../utils/errors';

module.exports = [
  {
    path: '/projects',
    method: 'GET',
    handler: (request, reply) => {
      let {page, limit} = request;
      let offset = (page - 1) * limit;

      Promise.all([
        db('projects').count('id'),
        db.select('*').from('projects').orderBy('created_at').offset(offset).limit(limit)
      ]).then(res => {
        const [count, projects] = res;
        return Promise.map(projects, p => attachProjectFiles(p).then(p => attachScenarioCount(p)))
          .then(projects => {
            request.count = parseInt(count[0].count);
            reply(projects);
          });
      });
    }
  },
  {
    path: '/projects/{projId}',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        }
      }
    },
    handler: (request, reply) => {
      getProject(request.params.projId)
        .then(project => reply(project))
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];

function attachProjectFiles (project) {
  return db.select('id', 'name', 'type', 'path', 'created_at')
    .from('projects_files')
    .where('project_id', project.id)
    .whereIn('type', ['profile', 'villages', 'admin-bounds'])
    .then(files => {
      project.files = files || [];
      return project;
    });
}

function attachScenarioCount (project) {
  return db('scenarios')
    .count('id')
    .where('project_id', project.id)
    .then(count => {
      project.scenarioCount = parseInt(count[0].count);
      return project;
    });
}

function getProject (id) {
  return db.select('*')
    .from('projects')
    .where('id', id)
    .orderBy('created_at')
    .then(projects => {
      if (!projects.length) throw new ProjectNotFoundError();
      return projects[0];
    })
    .then(project => attachProjectFiles(project))
    .then(project => attachFinishSetupOperation(project))
    .then(project => {
      // Check if a project is ready to move out of the setup phase.
      // Get 1st scenario files.
      return db('scenarios_files')
        .where('project_id', project.id)
        .whereIn('type', ['road-network', 'poi'])
        .where('scenario_id', function () {
          this.select('id')
            .from('scenarios')
            .where('project_id', project.id)
            .where('master', true);
        }).then(scenarioFiles => {
          // For a file to be ready it need 5 files:
          // - 3 on the project
          // - 2 on the ghost scenario.
          // There's no need for file type validation because it's all
          // done on file upload.
          project.readyToEndSetup = scenarioFiles.length === 2 && project.files.length === 3;
          return project;
        });
    })
    .then(project => attachScenarioCount(project));
}

function attachFinishSetupOperation (project) {
  return db.select('*')
    .from('operations')
    .where('operations.project_id', project.id)
    .where('operations.scenario_id', function () {
      this.select('id')
        .from('scenarios')
        .where('project_id', project.id)
        .where('master', true);
    })
    .where('operations.name', 'project-setup-finish')
    .orderBy('created_at', 'desc')
    .limit(1)
    .first()
    .then(op => {
      if (!op) {
        project.finish_setup = null;
        return project;
      }

      return db.select('*')
        .from('operations_logs')
        .where('operation_id', op.id)
        .then(logs => {
          let errored = false;
          if (logs.length) {
            errored = logs[logs.length - 1].code === 'error';
          }
          project.finish_setup = {
            id: op.id,
            status: op.status,
            created_at: op.created_at,
            updated_at: op.updated_at,
            errored,
            logs: logs.map(l => ({
              id: l.id,
              code: l.code,
              data: l.data,
              created_at: l.created_at
            }))
          };
          return project;
        });
    });
}

module.exports.getProject = getProject;
