'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { ProjectNotFoundError } from '../utils/errors';
import { getSourceData, getOperationData } from '../utils/utils';

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
        return Promise.map(projects, p => attachProjectSourceData(p).then(p => attachScenarioCount(p)))
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

function attachProjectSourceData (project) {
  return getSourceData(db, 'project', project.id)
    .then(sourceData => {
      project.sourceData = sourceData;
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
    .first()
    .then(project => {
      if (!project) throw new ProjectNotFoundError();
      return project;
    })
    .then(project => attachProjectSourceData(project))
    .then(project => attachFinishSetupOperation(project))
    .then(project => {
      // GetId of first scenario.
      return db('scenarios')
        .select('id')
        .where('project_id', project.id)
        .where('master', true)
        .first()
        .then(scenario => getSourceData(db, 'scenario', scenario.id))
        .then(scenarioSourceData => {
          let sources = Object.assign({}, project.sourceData, scenarioSourceData);

          // Check if all sources are valid.
          // If source is osm is OK.
          // If is file, there has to be at least one.
          project.readyToEndSetup = Object.keys(sources)
            .every(k => {
              let src = sources[k];
              if (src.type === null) return false;
              if (src.type === 'file') return src.files.length >= 1;
              return true;
            });

          return project;
        });
    })
    .then(project => attachScenarioCount(project));
}

function attachFinishSetupOperation (project) {
  return db('scenarios')
    .select('id')
    .where('project_id', project.id)
    .where('master', true)
    .first()
    .then(scenario => getOperationData(db, 'project-setup-finish', scenario.id))
    .then(opData => {
      project.finish_setup = opData;
      return project;
    });
}

module.exports.getProject = getProject;
