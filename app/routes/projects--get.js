'use strict';
import Joi from 'joi';
import Promise from 'bluebird';

import db from '../db/';
import { ProjectNotFoundError, getBoomResponseForError } from '../utils/errors';
import { getSourceData, getOperationData } from '../utils/utils';

export default [
  {
    path: '/projects',
    method: 'GET',
    handler: async (request, reply) => {
      let {page, limit} = request;
      let offset = (page - 1) * limit;

      try {
        let [{count}, projects] = await Promise.all([
          db('projects').count('id').first(),
          db.select('*').from('projects').orderBy('created_at').offset(offset).limit(limit)
        ]);
        projects = await Promise.map(projects, p => attachProjectSourceData(p).then(p => attachScenarioCount(p)));
        request.count = parseInt(count);
        reply(projects);
      } catch (error) {
        reply(getBoomResponseForError(error));
      }
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
    handler: async(request, reply) => {
      try {
        const project = await getProject(request.params.projId);
        reply(project);
      } catch (error) {
        reply(getBoomResponseForError(error));
      }
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
