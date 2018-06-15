'use strict';
import Promise from 'bluebird';

import db from '../../db/';
import {
  getJSONFileContents,
  putFileStream
} from '../../s3/utils';
import { importPOI } from '../rra-osm-p2p';
import * as overpass from '../../utils/overpass';
import { downloadWbCatalogPoiFile, waitForEventsOnEmitter } from './common';

export default async function (projId, scId, {op, emitter, logger, appLogger}) {
  const source = await db('scenarios_source_data')
    .select('*')
    .where('scenario_id', scId)
    .where('name', 'poi')
    .first();

  // Contains the info about the files as is in the database.
  let fileData;
  // Contains the poi data keyed by POI type.
  let poisData = {};
  if (source.type === 'wbcatalog') {
    fileData = await downloadWbCatalogPoiFile(projId, scId, source, logger);
  }

  if (source.type === 'file') {
    fileData = await db('scenarios_files')
      .select('*')
      .where('project_id', projId)
      .where('scenario_id', scId)
      .where('type', 'poi');
  }

  // Load the data into poisData keying it by type.
  if (source.type === 'wbcatalog' || source.type === 'file') {
    const filesContent = Promise.map(fileData, file => getJSONFileContents(file.path));
    fileData.forEach((f, idx) => { poisData[f.subtype] = filesContent[idx]; });
  }

  if (source.type === 'osm') {
    // If importing from OSM we need to wait for the admin bounds.
    const result = await waitForEventsOnEmitter(emitter, 'admin-bounds:data');
    const adminBoundsFc = result['admin-bounds:data'];
    poisData = await importOSMPOIs(projId, scId, overpass.fcBbox(adminBoundsFc), source.data.osmPoiTypes, op, logger);
  }

  // Wait for the road network to know if edition is enabled or not.
  const result = await waitForEventsOnEmitter(emitter, 'road-network:active-editing');
  const allowImport = result['road-network:active-editing'];

  if (allowImport) {
    // Merge all feature collection together.
    // Add a property to keep track of the poi type.
    let fc = {
      type: 'FeatureCollection',
      features: Object.keys(poisData).reduce((acc, key) => {
        let feats = poisData[key].features;
        feats.forEach(f => { f.properties.ram_poi_type = key; });
        return acc.concat(feats);
      }, [])
    };

    const poiLogger = appLogger.group(`p${projId} s${scId} poi import`);
    poiLogger && poiLogger.log('process poi');
    return importPOI(projId, scId, op, fc, poiLogger);
  }
}

async function importOSMPOIs (projId, scId, bbox, poiTypes, op, logger) {
  logger && logger.log('Importing pois from overpass for bbox (S,W,N,E):', bbox);
  logger && logger.log('POI types:', poiTypes);

  await op.log('process:poi', {message: 'Importing poi from OSM'});

  // Clean the tables so any remnants of previous attempts are removed.
  // This avoids primary keys collisions and duplication.
  await db('scenarios_files')
    .where('project_id', projId)
    .where('scenario_id', scId)
    .where('type', 'poi')
    .del();

  let osmGeoJSON;
  try {
    osmGeoJSON = await overpass.importPOI(bbox, poiTypes);
  } catch (err) {
    // Just to log error
    logger && logger.log('Error importing from overpass', err.message);
    throw err;
  }

  logger && logger.log('Got POIS. Saving to S3 and db');

  let dbInsertions = [];
  let fileUploadPromises = [];
  let emptyPOI = [];

  Object.keys(osmGeoJSON).forEach(poiType => {
    // Filter out pois without anything
    if (osmGeoJSON[poiType].features.length) {
      const fileName = `poi_${poiType}_${Date.now()}`;
      const filePath = `scenario-${scId}/${fileName}`;

      // Prepare for db insertion.
      dbInsertions.push({
        name: fileName,
        type: 'poi',
        subtype: poiType,
        path: filePath,
        project_id: projId,
        scenario_id: scId,
        created_at: (new Date()),
        updated_at: (new Date())
      });

      // Save each poi type to S3.
      // Store as function to avoid immediate execution.
      fileUploadPromises.push(() => putFileStream(filePath, JSON.stringify(osmGeoJSON[poiType])));
    } else {
      emptyPOI.push(poiType);
    }
  });

  if (emptyPOI.length) {
    logger && logger.log(`No POI were returned for [${emptyPOI.join(', ')}]`);
    throw new Error(`No POI were returned for [${emptyPOI.join(', ')}]`);
  }

  // Save to database.
  const promises = fileUploadPromises.concat(() => db.batchInsert('scenarios_files', dbInsertions));

  // Using promise.map to take advantage of concurrency.
  await Promise.map(promises, p => p(), {concurrency: 3});

  return osmGeoJSON;
}
