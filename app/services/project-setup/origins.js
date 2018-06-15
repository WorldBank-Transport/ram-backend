'use strict';
import path from 'path';
import fs from 'fs-extra';
import bbox from '@turf/bbox';
import centerOfMass from '@turf/center-of-mass';
import _ from 'lodash';
import Promise from 'bluebird';
import https from 'https';
import os from 'os';
import fetch from 'node-fetch';
import EventEmitter from 'events';

import config from '../../config';
import db from '../../db/';
import Operation from '../../utils/operation';
import { setScenarioSetting, getScenarioSetting, getPropInsensitive } from '../../utils/utils';
import { createAdminBoundsVT, createRoadNetworkVT } from '../../utils/vector-tiles';
import {
  putFile as putFileToS3,
  getFileInfo,
  getFileContents,
  getJSONFileContents,
  putFileStream,
  removeFile
} from '../../s3/utils';
import { importRoadNetwork, importPOI, removeDatabase } from '../rra-osm-p2p';
import AppLogger from '../../utils/app-logger';
import * as overpass from '../../utils/overpass';
import { downloadWbCatalogProjectFile } from './common';

export default async function (projId, {op, logger}) {
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

  logger && logger.log('process origins');

  await op.log('process:origins', {message: 'Processing origins'});

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
