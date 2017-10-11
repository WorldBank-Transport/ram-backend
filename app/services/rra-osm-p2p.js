'use strict';
import fs from 'fs-extra';
import Promise from 'bluebird';
import os from 'os';
import cp from 'child_process';
import path from 'path';
import osmdb from 'osm-p2p';
import osmrouter from 'osm-p2p-server';
import osmP2PCreateChangeset from 'osm-p2p-server/api/create_changeset';
import osmP2PCloseChangeset from 'osm-p2p-server/api/close_changeset';
import importer from 'osm-p2p-db-importer';

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

export function importRoadNetwork (projId, scId, op, roadNetwork, logger) {
  const basePath = path.resolve(os.tmpdir(), `road-networkP${projId}S${scId}`);

  let baseDir = getDatabaseBaseDir();
  let dbName = getDatabaseName(projId, scId);
  let changesetId;

  let importPromise = Promise.promisify(importer);

  return op.log('process:road-network', {message: 'Road network processing started'})
    .then(() => openChangeset(projId, scId, logger))
    .then(id => { changesetId = id; })
    .then(() => createOSMChangeset(changesetId, roadNetwork, 'osm', basePath, logger))
    .then(() => closeDatabase(projId, scId))
    .then(() => logger && logger.log('Importing changeset into osm-p2p...'))
    .then(() => {
      let xml = fs.createReadStream(`${basePath}.osmc`);
      return importPromise(`${baseDir}/${dbName}`, xml);
    })
    .then(() => logger && logger.log('Importing changeset into osm-p2p... done'))
    .then(() => closeChangeset(projId, scId, changesetId, logger))
    // Note: There's no need to close the osm-p2p-db because when the process
    // terminates the connection is automatically closed.
    .then(() => op.log('process:road-network', {message: 'Road network processing finished'}));
}

function openChangeset (projId, scId, logger) {
  const db = getDatabase(projId, scId);
  return new Promise((resolve, reject) => {
    logger && logger.log('Creating changeset in database...');

    let changeset = {
      type: 'changeset',
      tags: {
        comment: `Project ${projId}, Scenario ${scId}`,
        created_by: 'RRA'
      }
    };
    osmP2PCreateChangeset(db)(changeset, (err, id, node) => {
      if (err) return reject(err);
      logger && logger.log('Creating changeset in database... done');
      return resolve(id);
    });
  });
}

function closeChangeset (projId, scId, changesetId, logger) {
  const db = getDatabase(projId, scId);
  return new Promise((resolve, reject) => {
    logger && logger.log('Closing changeset in database...');

    osmP2PCloseChangeset(db)(changesetId, (err) => {
      if (err) return reject(err);
      logger && logger.log('Closing changeset in database... done');
      return resolve();
    });
  });
}

function createOSMChangeset (changesetId, data, dataType, basePath, logger) {
  // Create an OSM Change file and store it in system /tmp folder.
  return new Promise((resolve, reject) => {
    logger && logger.log('Creating changeset file...');
    // OGR reads from a file
    fs.writeFileSync(`${basePath}.${dataType}`, data);

    // Use ogr2osm with:
    // -t - a custom translation file. Default only removes empty values
    // -o - to specify output file
    // -f - to force overwrite
    let cmd = path.resolve(__dirname, '../lib/ogr2osm/ogr2osm.py');
    let args = [
      cmd,
      `${basePath}.${dataType}`,
      '-t', './app/lib/ogr2osm/default_translation.py',
      '--changeset-id', changesetId,
      '-o', `${basePath}.osmc`,
      '-f'
    ];

    let conversionProcess = cp.spawn('python', args);
    let processError = '';
    conversionProcess.stderr.on('data', err => {
      processError += err.toString();
    });
    conversionProcess.on('close', code => {
      if (code !== 0) {
        let err = processError || `Unknown error. Code ${code}`;
        return reject(new Error(err));
      }
      logger && logger.log('Creating changeset file... done');
      return resolve(changesetId);
    });
  });
}
