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
