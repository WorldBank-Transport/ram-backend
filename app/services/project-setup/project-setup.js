'use strict';
import osm2json from 'osm2json';
import putChanges from 'osm-p2p-server/api/put_changes';
import createChangeset from 'osm-p2p-server/api/create_changeset';

import db from '../../db/';
import Operation from '../../utils/operation';
import { getFileContents, getJSONFileContents } from '../../s3/utils';
import { getDatabase } from '../rra-osm-p2p';

process.on('message', function (e) {
  // Capture all the errors.
  try {
    e.successTerminator = () => process.exit(0);
    e.errorTerminator = () => process.exit(1);
    startFinishSetupProcess(e);
  } catch (err) {
    process.send({type: 'error', data: err.message, stack: err.stack});
    throw err;
  }
});

export function startFinishSetupProcess (e) {
  const {opId, projId, scId, successTerminator, errorTerminator} = e;

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

  let op = new Operation(db);
  op.loadById(opId)
  .then(() => Promise.all([
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
  ]))
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
  .then(() => successTerminator())
  .catch(err => {
    console.log('err', err);
    op.log('error', {error: err.message})
      .then(op => op.finish())
      .then(() => errorTerminator(err.message), () => errorTerminator(err.message));
  });
}
