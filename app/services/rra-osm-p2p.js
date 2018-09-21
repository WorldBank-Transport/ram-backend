'use strict';
import fs from 'fs-extra';
import Promise from 'bluebird';
import os from 'os';
import cp from 'child_process';
import path from 'path';
import osmdb from 'osm-p2p';
import osmrouter from 'osm-p2p-server';
import importer from 'osm-p2p-import';

import config from '../config';

var dbConnections = {};

function getDatabaseName (projId, scId) {
  return `p${projId}s${scId}`;
}

function getDatabaseBaseDir () {
  return config.osmP2PDir;
}

export function getRouter (projId, scId) {
  return osmrouter(getDatabase(projId, scId));
}

export function getDatabase (projId, scId) {
  let baseDir = getDatabaseBaseDir();
  let dbName = getDatabaseName(projId, scId);

  // Create a connection if one is not found.
  if (!dbConnections[dbName]) {
    dbConnections[dbName] = osmdb(`${baseDir}/${dbName}`);
  }

  return dbConnections[dbName];
}

export function closeDatabase (projId, scId) {
  return new Promise((resolve, reject) => {
    let dbName = getDatabaseName(projId, scId);
    let db = dbConnections[dbName];

    // If there's no db stored means that no connection was open for this
    // db on the current process.
    if (!db) {
      return resolve();
    }

    let pending = 3;
    const done = () => {
      if (--pending === 0) {
        delete dbConnections[dbName];
        resolve();
      }
    };

    // Close all the connections.
    db.db.close(done);
    db.log.db.close(done);
    db.kdb.kdb.store.close(done);
  });
}

export function cloneDatabase (srcProjId, srcScId, destProjId, destScId) {
  return new Promise((resolve, reject) => {
    let baseDir = getDatabaseBaseDir();
    let srcDbName = getDatabaseName(srcProjId, srcScId);
    let destDbName = getDatabaseName(destProjId, destScId);

    fs.copy(`${baseDir}/${srcDbName}`, `${baseDir}/${destDbName}`, {overwrite: false, errorOnExist: true}, err => {
      if (err) return reject(err);
      return resolve();
    });
  });
}

export function removeDatabase (projId, scId) {
  return new Promise((resolve, reject) => {
    let baseDir = getDatabaseBaseDir();
    let dbName = getDatabaseName(projId, scId);

    fs.remove(`${baseDir}/${dbName}`, err => {
      if (err) return reject(err);

      delete dbConnections[dbName];
      return resolve();
    });
  });
}

export async function importRoadNetwork (projId, scId, op, roadNetwork, logger) {
  const importPromise = Promise.promisify(importer);
  const basePath = path.resolve(os.tmpdir(), `road-networkP${projId}S${scId}`);
  const osmDb = getDatabase(projId, scId);

  await op.log('process:road-network', {message: 'Road network processing started'});
  try {
    await convertToOSMXml(roadNetwork, 'osm', basePath, logger);
  } catch (error) {
    if (error.message.match(/'list' object has no attribute 'addparent'/)) {
      throw new Error('Road network format is not valid.');
    }
    throw error;
  }

  logger && logger.log('Importing changeset into osm-p2p...');

  const xml = fs.createReadStream(`${basePath}.osm`);
  await importPromise(osmDb, xml);

  // Note: There's no need to close the osm-p2p-db because when the process
  // terminates the connection is automatically closed.
  return op.log('process:road-network', {message: 'Road network processing finished'});
}

export async function importPOI (projId, scId, op, poiFc, logger) {
  const importPromise = Promise.promisify(importer);
  const basePath = path.resolve(os.tmpdir(), `poiP${projId}S${scId}`);
  const osmDb = getDatabase(projId, scId);

  await op.log('process:poi', {message: 'Poi processing started'});
  try {
    await convertToOSMXml(JSON.stringify(poiFc), 'geojson', basePath, logger);
  } catch (error) {
    console.log('value', JSON.stringify(poiFc));
    if (error.message.match(/'list' object has no attribute 'addparent'/)) {
      throw new Error('Poi files data is not ram compliant.');
    }
    throw error;
  }

  logger && logger.log('Importing changeset into osm-p2p...');

  const xml = fs.createReadStream(`${basePath}.osm`);
  await importPromise(osmDb, xml);

  // Note: There's no need to close the osm-p2p-db because when the process
  // terminates the connection is automatically closed.
  return op.log('process:poi', {message: 'Poi processing finished'});
}

function convertToOSMXml (data, dataType, basePath, logger) {
  // Create an OSM Change file and store it in system /tmp folder.
  return new Promise(async (resolve, reject) => {
    logger && logger.log('Creating changeset file...');
    // OGR reads from a file
    await fs.writeFile(`${basePath}.${dataType}`, data);

    // Use ogr2osm with:
    // -t - a custom translation file. Default only removes empty values
    // -o - to specify output file
    // -f - to force overwrite
    const cmd = path.resolve(__dirname, '../lib/ogr2osm/ogr2osm.py');
    const args = [
      cmd,
      `${basePath}.${dataType}`,
      '-t', './app/lib/ogr2osm/default_translation.py',
      '-o', `${basePath}.osm`,
      '-f'
    ];

    const conversionProcess = cp.spawn('python', args);
    let processError = '';
    conversionProcess.stderr.on('data', err => {
      processError += err.toString();
    });
    conversionProcess.on('close', code => {
      if (code !== 0) {
        const err = processError || `Unknown error. Code ${code}`;
        return reject(new Error(err));
      }
      logger && logger.log('Creating changeset file... done');
      return resolve();
    });
  });
}
