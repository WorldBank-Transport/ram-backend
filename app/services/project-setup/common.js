'use strict';
import path from 'path';
import fs from 'fs-extra';
import _ from 'lodash';
import Promise from 'bluebird';
import https from 'https';
import os from 'os';
import fetch from 'node-fetch';

import db from '../../db/';
import {
  putFile as putFileToS3
} from '../../s3/utils';

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
  logger && logger.log(`Download from wbcatalog - ${source.name}...`);

  // Figure out what we're dealing with from the source name:
  const what = {
    'poi': 'poi', // Special case because of multiple files.
    'road-network': 'scenarios',
    'profile': 'projects',
    'origins': 'projects',
    'admin-bounds': 'projects'
  }[source.name];

  return Promise.map(source.data.resources, async (wbCatRes) => {
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

    logger && logger.log(`Download from wbcatalog - ${source.name}... done`);

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

    let fileName;
    let filePath;
    switch (what) {
      case 'projects':
        fileName = `${source.name}_${Date.now()}`;
        filePath = `project-${scId}/${fileName}`;
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

    logger && logger.log(`Upload wbcatalog file to storage - ${source.name}...`);
    await putFileToS3(filePath, tempPath);

    let data = {
      name: fileName,
      type: source.name,
      path: filePath,
      project_id: projId,
      created_at: (new Date()),
      updated_at: (new Date())
    };

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

    logger && logger.log(`Upload wbcatalog file to storage - ${source.name}... done`);

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

/**
 * Resolves a promise once all the events fired once.
 * The promise is resolved with an object keyed by the event name containing
 * the result of each event.
 * @example
 *  waitForEventsOnEmitter(emitter, 'event1', 'event2')
 *  {
 *    'event1': result,
 *    'event2': result2
 *  }
 *
 * Note:
 * The event listeners are removed once triggered but non triggered events
 * will presist, possibly causing unwanted side effects. If there's no need
 * to wait for events anymore, they have to be removed manually.
 *
 * Note2:
 * For the scope of this script the above is not an isseu because all the
 * events are cleared once the process exits (on error or success), therefore
 * there's no risk that lingering events contaminate different executions.
 *
 * @param {object} emitter EventEmitter intance
 * @param {string} events Events to listen for
 *
 * @returns promise
 */
export async function waitForEventsOnEmitter (emitter, ...events) {
  return new Promise((resolve) => {
    let completed = 0;
    let results = {};
    events.forEach(e => emitter.once(e, (result = null) => {
      results[e] = result;
      if (++completed === events.length) resolve(results);
    }));
  });
}
