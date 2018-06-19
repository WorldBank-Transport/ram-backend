'use strict';
import centerOfMass from '@turf/center-of-mass';

import db from '../../db/';
import { getPropInsensitive } from '../../utils/utils';
import {
  getJSONFileContents
} from '../../s3/utils';
import { downloadWbCatalogProjectFile } from '../../utils/wbcatalog';

/**
 * Processes the Origins depending on the source.
 *
 * Origins
 *  Catalog:
 *    - Download from server
 *    - Cleanup and store in DB
 *  File:
 *    - Cleanup and store in DB
 *
 * @param {number} projId Project id
 * @param {object} options Additional parameters
 * @param {object} options.op Operation instance
 * @param {object} options.logger Output logger
 */
export default async function (projId, {op, logger}) {
  logger && logger.log('process origins');
  await op.log('process:origins', {message: 'Processing origins'});

  const source = await db('projects_source_data')
    .select('*')
    .where('project_id', projId)
    .where('name', 'origins')
    .first();

  let originsData;
  if (source.type === 'wbcatalog') {
    originsData = await downloadWbCatalogProjectFile(projId, source, logger);
  }

  if (source.type === 'file') {
    originsData = await db('projects_files')
      .select('*')
      .where('project_id', projId)
      .where('type', 'origins')
      .first();
  }

  // Clean the tables so any remnants of previous attempts are removed.
  // This avoids primary keys collisions.
  await db('projects_origins')
    .where('project_id', projId)
    .del();

  const indicators = originsData.data.indicators;
  const neededProps = indicators.map(o => o.key);

  const originsFC = await getJSONFileContents(originsData.path);

  logger && logger.log('origins before filter', originsFC.features.length);
  const features = originsFC.features.filter(feat => {
    const props = Object.keys(feat.properties);
    return neededProps.every(o => props.indexOf(o) !== -1);
  });
  logger && logger.log('origins after filter', features.length);

  const originsIndicators = [];
  const origins = features.map(feat => {
    const coordinates = feat.geometry.type === 'Point'
      ? feat.geometry.coordinates
      : centerOfMass(feat).geometry.coordinates;

    // Will be flattened later.
    // The array is constructed in this way so we can match the index of the
    // results array and attribute the correct id.
    const featureIndicators = indicators.map(ind => ({
      key: ind.key,
      label: ind.label,
      value: parseInt(feat.properties[ind.key])
    }));
    originsIndicators.push(featureIndicators);

    return {
      project_id: projId,
      name: feat.properties[getPropInsensitive(feat.properties, 'name')] || 'N/A',
      coordinates: JSON.stringify(coordinates)
    };
  });

  await db.transaction(async function (trx) {
    const ids = await trx.batchInsert('projects_origins', origins)
      .returning('id');

    // Add ids to the originsIndicators and flatten the array in the process.
    let flat = [];
    originsIndicators.forEach((resInd, resIdx) => {
      resInd.forEach(ind => {
        ind.origin_id = ids[resIdx];
        flat.push(ind);
      });
    });

    await trx.batchInsert('projects_origins_indicators', flat);
  });
}
