'use strict';
import path from 'path';
import fs from 'fs-extra';
import _ from 'lodash';
import Promise from 'bluebird';
import https from 'https';
import os from 'os';
import fetch from 'node-fetch';

import db from '../db/';
import {
  putFile as putFileToS3,
  getLocalJSONFileContents
} from '../s3/utils';

// Allow unauthorized requests.
// https://github.com/WorldBank-Transport/ram-backend/issues/223
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

/**
 * Downloads a file form the url to the given destination.
 * Note:
 * This is used to download files form the WBCatalog and therefore uses a
 * special https agent that doesn't reject unauthorized certs. See above.
 *
 * @param {string} url Source url
 * @param {string} dest Destination path
 */
function downloadFile (url, dest) {
  return new Promise((resolve, reject) => {
    fetch(url, {agent: httpsAgent})
      .then(res => {
        const stream = fs.createWriteStream(dest);
        res.body.pipe(stream);
        stream.on('finish', () => resolve(dest));
        stream.on('error', (e) => reject(e));
      })
      .catch(reject);
  });
}

/**
 * Download a file from the WB Catalog and store it in the database.
 *
 * @param {number} projId Project id
 * @param {number} scId Scenario id
 * @param {object} source Source object
 * @param {object} logger Output logger
 */
async function downloadWbCatalogFile (projId, scId, source, logger) {
  // Figure out what we're dealing with from the source name:
  const what = {
    'poi': 'poi', // Special case because of multiple files.
    'road-network': 'scenarios',
    'profile': 'projects',
    'origins': 'projects',
    'admin-bounds': 'projects'
  }[source.name];

  // Clean the tables so any remnants of previous attempts are removed.
  // This avoids primary keys collisions and duplication.
  switch (what) {
    case 'projects':
      await db('projects_files')
        .where('project_id', projId)
        .where('type', source.name)
        .del();
      break;
    case 'scenarios':
    case 'poi':
      await db('scenarios_files')
        .where('project_id', projId)
        .where('scenario_id', scId)
        .where('type', source.name)
        .del();
      break;
  }

  return Promise.map(source.data.resources, async (wbCatRes, idx, len) => {
    logger && logger.log(`Download from wbcatalog - ${source.name} (${idx + 1} of ${len})...`);
    const {key, label} = wbCatRes;
    const wbCatalogRes = await db('wbcatalog_resources')
      .select('*')
      .where('resource_id', key)
      .first();

    let tempPath;
    switch (what) {
      case 'projects':
        tempPath = path.resolve(os.tmpdir(), `p${projId}--${source.name}${path.extname(wbCatalogRes.resource_url)}`);
        break;
      case 'scenarios':
        tempPath = path.resolve(os.tmpdir(), `p${projId}-s${scId}--${source.name}${path.extname(wbCatalogRes.resource_url)}`);
        break;
      case 'poi':
        tempPath = path.resolve(os.tmpdir(), `p${projId}-s${scId}--${source.name}-${label}${path.extname(wbCatalogRes.resource_url)}`);
        break;
    }

    await downloadFile(wbCatalogRes.resource_url, tempPath);
    logger && logger.log(`Download from wbcatalog - ${source.name} (${idx + 1} of ${len})... done`);

    let fileName;
    let filePath;
    switch (what) {
      case 'projects':
        fileName = `${source.name}_${Date.now()}`;
        filePath = `project-${projId}/${fileName}`;
        break;
      case 'scenarios':
        fileName = `${source.name}_${Date.now()}`;
        filePath = `scenario-${scId}/${fileName}`;
        break;
      case 'poi':
        fileName = `${source.name}_${label}_${Date.now()}`;
        filePath = `scenario-${scId}/${fileName}`;
        break;
    }

    logger && logger.log(`Upload wbcatalog file to storage - ${source.name} (${idx + 1} of ${len})...`);
    await putFileToS3(filePath, tempPath);

    let data = {
      name: fileName,
      type: source.name,
      path: filePath,
      project_id: projId,
      created_at: (new Date()),
      updated_at: (new Date())
    };

    // When using a wbcatalog file for the origins figure out which ones of the
    // properties are numbers and use those as indicators.
    if (source.name === 'origins') {
      const originsFileData = await getLocalJSONFileContents(tempPath);
      const feat = originsFileData.features[0];
      const featPropKeys = Object.keys(feat.properties).filter(p => {
        const val = feat.properties[p];
        const type = typeof val;
        return ((type === 'number' || type === 'string') && val !== '') ? !isNaN(Number(val)) : false;
      });

      if (!featPropKeys.length) {
        throw new Error('Unable to find valid population estimates on WB Catalog source for Population data');
      }

      // Add the the indicator information to the data to store.
      data.data = {
        indicators: featPropKeys.map(p => ({key: p, label: p})),
        availableInd: featPropKeys
      };
    }

    switch (what) {
      case 'projects':
        await db('projects_files').insert(data);
        break;
      case 'scenarios':
        data.scenario_id = scId;
        await db('scenarios_files').insert(data);
        break;
      case 'poi':
        data.scenario_id = scId;
        data.subtype = label;
        await db('scenarios_files').insert(data);
        break;
    }

    logger && logger.log(`Upload wbcatalog file to storage - ${source.name} (${idx + 1} of ${len})... done`);

    return data;
  }, {concurrency: 3});
}

/**
 * Download a file from the WB Catalog for Project files
 *
 * @param {number} projId Project id
 * @param {object} source Source object
 * @param {object} logger Output logger
 *
 * @see downloadWbCatalogFile
 */
export async function downloadWbCatalogProjectFile (projId, source, logger) {
  source = _.cloneDeep(source);
  // Ensure that there is only one resource for these type of files.
  source.data.resources = [source.data.resources[0]];
  const files = await downloadWbCatalogFile(projId, null, source, logger);
  return files[0];
}

/**
 * Download a file from the WB Catalog for Scenario files
 *
 * @param {number} projId Project id
 * @param {number} scId Scenario id
 * @param {object} source Source object
 * @param {object} logger Output logger
 *
 * @see downloadWbCatalogFile
 */
export async function downloadWbCatalogScenarioFile (projId, scId, source, logger) {
  source = _.cloneDeep(source);
  // Ensure that there is only one resource for these type of files.
  source.data.resources = [source.data.resources[0]];
  const files = await downloadWbCatalogFile(projId, scId, source, logger);
  return files[0];
}

/**
 * Download a file from the WB Catalog for the POI source.
 *
 * @param {number} projId Project id
 * @param {number} scId Scenario id
 * @param {object} source Source object
 * @param {object} logger Output logger
 *
 * @see downloadWbCatalogFile
 */
export async function downloadWbCatalogPoiFile (projId, scId, source, logger) {
  return downloadWbCatalogFile(projId, scId, source, logger);
}
