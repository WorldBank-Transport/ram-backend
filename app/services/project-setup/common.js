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

async function downloadWbCatalogFile (projId, scId, source, logger) {
  logger && logger.log(`download from wbcatalog - ${source.name}`);

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

    return data;
  }, {concurrency: 3});
}

export async function downloadWbCatalogProjectFile (projId, source, logger) {
  source = _.cloneDeep(source);
  // Ensure that there is only one resource for these type of files.
  source.data.resources = [source.data.resources[0]];
  const files = await downloadWbCatalogFile(projId, null, source, logger);
  return files[0];
}

export async function downloadWbCatalogScenarioFile (projId, scId, source, logger) {
  source = _.cloneDeep(source);
  // Ensure that there is only one resource for these type of files.
  source.data.resources = [source.data.resources[0]];
  const files = await downloadWbCatalogFile(projId, scId, source, logger);
  return files[0];
}

export async function downloadWbCatalogPoiFile (projId, scId, source, logger) {
  return downloadWbCatalogFile(projId, scId, source, logger);
}



// TODO add note
// events could persist but when used in a process they are removed once the process finishes.
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

// import EventEmitter from 'events';
// const myEmitter = new EventEmitter();


// async function run () {
//   console.log('a');
//   const r = await waitForEventsOnEmitter(myEmitter, 'event1', 'event2');
//   console.log('b', r);
// }

// run();
// myEmitter.emit('event1', {stuff: 0});
// setTimeout(() => {
//   myEmitter.emit('event2');
// }, 1000);