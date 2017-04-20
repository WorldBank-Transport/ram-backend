'use strict';
import osmdb from 'osm-p2p';
import osmrouter from 'osm-p2p-server';
import fs from 'fs-extra';

import config from '../config';

var dbConnections = {};

function getDatabaseName (projId, scId) {
  return `p${projId}s${scId}`;
}

function getDatabaseBaseDir () {
  return `${config.baseDir}/../osm-p2p-dbs`;
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
      return resolve();
    });
  });
}
