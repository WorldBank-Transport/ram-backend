'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { getPresignedUrl, listenForFile } from '../s3/utils';
import { ProjectNotFoundError, ScenarioNotFoundError, FileExistsError } from '../utils/errors';

const routeConfig = {
  validate: {
    params: {
      projId: Joi.number(),
      scId: Joi.number()
    },
    payload: {
      type: Joi.valid('road-network', 'poi').required()
    }
  }
};

// The upload is done directly to the storage bucket.
// This endpoint just provides the presigned url, and listens for the upload
// completion to insert it in the database.
module.exports = [
  {
    // When the scenario id is set to 0, the system gets the main project
    // scenario. Every project has one that is created when the project is
    // created, so this assumption is safe.
    // Doing this allows us to avoid multiple request to figure out what the
    // id of the main scenario is. Specially helpful when setting up the project.
    path: '/projects/{projId}/scenarios/0/files',
    method: 'POST',
    config: routeConfig,
    handler: (request, reply) => {
      db('scenarios')
        .select('id')
        .where('project_id', request.params.projId)
        .orderBy('id')
        .limit(1)
        .then(res => {
          if (!res.length) throw new ProjectNotFoundError();
          return res[0].id;
        })
        .then(id => {
          request.params.scId = id;
          scenarioFileUploadHAndler(request, reply);
        })
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  },
  {
    path: '/projects/{projId}/scenarios/{scId}/files',
    method: 'POST',
    config: routeConfig,
    handler: scenarioFileUploadHAndler
  }
];

function scenarioFileUploadHAndler (request, reply) {
  const type = request.payload.type;
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
      this.on('scenarios.id', '=', 'scenarios_files.scenario_id')
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
    .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
    .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
    .catch(FileExistsError, e => reply(Boom.conflict(e.message)))
    .catch(err => {
      console.log('err', err);
      reply(Boom.badImplementation(err));
    });
}
