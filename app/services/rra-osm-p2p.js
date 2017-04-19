'use strict';
import osmdb from 'osm-p2p';
import osmrouter from 'osm-p2p-server';

import config from '../config';

var dbConnections = {};

export function getRouter (projId, scId) {
  return osmrouter(getDatabase(projId, scId));
}

export function getDatabase (projId, scId) {
  let baseDir = `${config.baseDir}/../osm-p2p-dbs`;
  let dbName = `p${projId}s${scId}`;

  // Create a connection if one is not found.
  if (!dbConnections[dbName]) {
    dbConnections[dbName] = osmdb(`${baseDir}/${dbName}`);
  }

  return dbConnections[dbName];
}

export function closeDatabase (projId, scId) {
  return new Promise((resolve, reject) => {
    let dbName = `p${projId}s${scId}`;
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
