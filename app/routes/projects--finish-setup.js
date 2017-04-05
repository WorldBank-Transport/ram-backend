'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';

import db from '../db/';
import { ProjectNotFoundError, DataConflictError } from '../utils/errors';
import { getProject } from './projects--get';
import { getFileContents, getJSONFileContents } from '../s3/utils';
import Operation from '../utils/operation';

import osm2json from 'osm2json';
import putChanges from 'osm-p2p-server/api/put_changes';
import createChangeset from 'osm-p2p-server/api/create_changeset';

import { getDatabase } from '../services/rra-osm-p2p';

module.exports = [
  {
    path: '/projects/{projId}/finish-setup',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        payload: {
          scenarioName: Joi.string().required(),
          scenarioDescription: Joi.string()
        }
      }
    },
    handler: (request, reply) => {
      getProject(request.params.projId)
        .then(project => {
          if (project.status !== 'pending') {
            throw new DataConflictError('Project setup already completed');
          }
          if (!project.readyToEndSetup) {
            throw new DataConflictError('Project preconditions to finish setup not met');
          }
        })
        .then(() => db('scenarios')
          .select('*')
          .where('project_id', request.params.projId)
          .where('master', true)
          .first()
        )
        .then(scenario => {
          let projId = scenario.project_id;
          let scId = scenario.id;
          let {scenarioName, scenarioDescription} = request.payload;

          return db.transaction(function (trx) {
            return Promise.all([
              trx('projects')
                .update({
                  updated_at: (new Date())
                })
                .where('id', projId),
              trx('scenarios')
                .update({
                  name: scenarioName,
                  description: typeof scenarioDescription === 'undefined' ? '' : scenarioDescription,
                  updated_at: (new Date())
                })
                .where('id', scId)
            ]);
          })
          .then(() => startOperation(projId, scId)
            .then(op => startFinishSetupProcess(op, projId, scId))
          );
        })
        .then(() => reply({statusCode: 200, message: 'Project setup finish started'}))
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(DataConflictError, e => reply(Boom.conflict(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];

function startOperation (projId, scId) {
  let op = new Operation(db);
  return op.loadByData('project-setup-finish', projId, scId)
    .then(op => {
      if (op.isStarted()) {
        throw new DataConflictError('Project finish setup already in progress');
      }
    }, err => {
      // In this case if the operation doesn't exist is not a problem.
      if (err.message.match(/not exist/)) { return; }
      throw err;
    })
    .then(() => {
      let op = new Operation(db);
      return op.start('project-setup-finish', projId, scId);
    });
}

function startFinishSetupProcess (op, projId, scId) {
  //
  function processAdminAreas (adminBoundsFc) {
    console.log('processAdminAreas');
    let task = db.transaction(function (trx) {
      let adminAreas = adminBoundsFc.features
        .map(o => ({name: o.properties.name, selected: false}))
        .filter(o => !!o.name);

      return Promise.all([
        trx('projects')
          .update({
            updated_at: (new Date())
          })
          .where('id', projId),
        trx('scenarios')
          .update({
            admin_areas: JSON.stringify(adminAreas),
            updated_at: (new Date())
          })
          .where('id', scId)
      ]);
    });

    return op.log('process:admin-bounds', {message: 'Processing admin areas'})
      .then(() => task);
  }

  function processRoadNetwork (roadNetwork) {
    // WARNING!!!!
    // ////////////////////////////////////////////////////////// //
    // roadNetwork MUST be converted to a changeset before using. //
    // This is not implemented yet!                               //
    // ////////////////////////////////////////////////////////// //

    console.log('processRoadNetwork start');
    console.time('processRoadNetwork');
    let task = new Promise((resolve, reject) => {
      let db = getDatabase(projId, scId);

      let changeset = {
        type: 'changeset',
        tags: {
          comment: `Finish project setup. Project ${projId}, Scenario ${scId}`,
          created_by: 'RRA'
        }
      };
      createChangeset(db)(changeset, (err, id, node) => {
        if (err) return reject(err);

        let changes = osm2json({coerceIds: false}).parse(roadNetwork);
        // Set the correct id.
        changes = changes.map(c => {
          c.changeset = id;
          return c;
        });

        putChanges(db)(changes, id, (err, diffResult) => {
          console.timeEnd('processRoadNetwork');
          if (err) return reject(err);
          return resolve();
        });
      });
    });

    return op.log('process:road-network', {message: 'Road network processing started'})
      .then(() => task)
      .then(() => op.log('process:road-network', {message: 'Road network processing finished'}));
  }

  Promise.all([
    db('scenarios_files')
      .select('*')
      .where('project_id', projId)
      .where('type', 'road-network')
      .first()
      .then(file => getFileContents(file.path)),
    db('projects_files')
      .select('*')
      .where('project_id', projId)
      .where('type', 'admin-bounds')
      .first()
      .then(file => getJSONFileContents(file.path))
  ])
  .then(filesContent => {
    let [roadNetwork, adminBoundsFc] = filesContent;

    return Promise.all([
      processAdminAreas(adminBoundsFc),
      processRoadNetwork(roadNetwork)
    ]);
  })
  .then(() => {
    return db.transaction(function (trx) {
      return Promise.all([
        trx('projects')
          .update({updated_at: (new Date()), status: 'active'})
          .where('id', projId),
        trx('scenarios')
          .update({updated_at: (new Date()), status: 'active'})
          .where('id', scId)
      ])
      .then(() => op.log('success', {message: 'Operation complete'}).then(op => op.finish()));
    });
  })
  .catch(err => {
    op.log('error', {error: err.message}).then(op => op.finish());
  });
}
