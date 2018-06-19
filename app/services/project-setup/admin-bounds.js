'use strict';
import bbox from '@turf/bbox';
import _ from 'lodash';
import Promise from 'bluebird';

import db from '../../db/';
import { getPropInsensitive } from '../../utils/utils';
import { createAdminBoundsVT } from '../../utils/vector-tiles';
import {
  getJSONFileContents,
  putFileStream,
  removeFile
} from '../../s3/utils';
import { downloadWbCatalogProjectFile } from '../../utils/wbcatalog';

/**
 * Processes the Admin boundaries depending on the source.
 *
 * Admin bounds
 *  Catalog:
 *    - Download from server
 *    - Cleanup and store in DB
 *    - Create vector tiles
 *  File:
 *    - Cleanup and store in DB
 *    - Create vector tiles
 *
 * @param {number} projId Project id
 * @param {number} scId Scenario id
 * @param {object} options Additional parameters
 * @param {object} options.op Operation instance
 * @param {object} options.emitter Emitter to coordinate execution
 * @param {object} options.logger Output logger
 */
export default async function (projId, scId, {op, emitter, logger}) {
  logger && logger.log('process admin areas');
  await op.log('process:admin-bounds', {message: 'Processing admin areas'});

  const source = await db('projects_source_data')
    .select('*')
    .where('project_id', projId)
    .where('name', 'admin-bounds')
    .first();

  if (source.type === 'wbcatalog') {
    await downloadWbCatalogProjectFile(projId, source, logger);
  }

  // The remaining process is the same for both sources.
  // Get the file data.
  const adminBoundsData = await db('projects_files')
    .select('*')
    .where('project_id', projId)
    .where('type', 'admin-bounds')
    .first();

  const adminBoundsFc = await getJSONFileContents(adminBoundsData.path);

  if (!adminBoundsFc.features) {
    throw new Error('Invalid administrative boundaries file');
  }

  const filteredAA = {
    'type': 'FeatureCollection',
    'features': adminBoundsFc.features
      .filter(o => !!o.properties[getPropInsensitive(o.properties, 'name')] && o.geometry.type !== 'Point')
      .map(o => {
        // Normalize name prop.
        o.properties.name = o.properties[getPropInsensitive(o.properties, 'name')];
        return o;
      })
  };

  // Clean the tables so any remnants of previous attempts are removed.
  // This avoids primary keys collisions.
  await Promise.all([
    db('projects_aa')
      .where('project_id', projId)
      .del(),
    db('scenarios_settings')
      .where('scenario_id', scId)
      .where('key', 'admin_areas')
      .del()
  ]);

  // Populate DB with admin areas.
  await db.transaction(function (trx) {
    let adminAreas = _(filteredAA.features)
      .sortBy(o => _.kebabCase(o.properties.name))
      .map(o => {
        return {
          name: o.properties.name,
          type: o.properties.type || 'Admin Area',
          geometry: JSON.stringify(o.geometry.coordinates),
          project_id: projId
        };
      })
      .value();

    let adminAreasBbox = bbox(filteredAA);

    return Promise.all([
      trx('projects')
        .update({
          bbox: JSON.stringify(adminAreasBbox),
          updated_at: (new Date())
        })
        .where('id', projId),

      trx.batchInsert('projects_aa', adminAreas)
        .returning('id'),

      trx('scenarios_settings')
        .insert({
          scenario_id: scId,
          key: 'admin_areas',
          value: '[]',
          created_at: (new Date()),
          updated_at: (new Date())
        })
        .where('id', projId)
    ]);
  });

  // Update the admin bounds file with the filtered features.
  // A clean file is needed for the VT generation.
  const fc = {
    'type': 'FeatureCollection',
    'features': filteredAA.features.map(o => ({
      type: 'Feature',
      properties: {
        name: o.properties.name,
        type: o.properties.type || 'admin-area',
        project_id: projId
      },
      geometry: o.geometry
    }))
  };

  const fileName = `admin-bounds_${Date.now()}`;
  const filePath = `project-${projId}/${fileName}`;

  // Get current file and remove it
  const fileData = await db('projects_files')
    .select('*')
    .where('project_id', projId)
    .where('type', 'admin-bounds')
    .first();

  await putFileStream(filePath, JSON.stringify(fc));

  await db('projects_files')
  .update({
    name: fileName,
    path: filePath,
    updated_at: (new Date())
  })
  .where('id', fileData.id);

  await removeFile(fileData.path);

  // Emit data for other processes to use.
  emitter.emit('admin-bounds:data', adminBoundsFc);

  if (process.env.DS_ENV !== 'test') {
    await createAdminBoundsVT(projId, scId, op, filePath).promise;
  }
}
