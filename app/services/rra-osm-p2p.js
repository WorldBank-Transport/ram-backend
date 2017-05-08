'use strict';
import fs from 'fs-extra';
import os from 'os';
import cp from 'child_process';
import path from 'path';
import osmdb from 'osm-p2p';
import osmrouter from 'osm-p2p-server';
import osm2json from 'osm2json';
import putChanges from 'osm-p2p-server/api/put_changes';
import createChangeset from 'osm-p2p-server/api/create_changeset';
import osmP2PErrors from 'osm-p2p-server/errors';

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
      return resolve();
    });
  });
}

export function importRoadNetwork (projId, scId, op, roadNetwork) {
  console.time('processRoadNetwork');
  const db = getDatabase(projId, scId);
  const basePath = path.resolve(os.tmpdir(), `road-networkP${projId}S${scId}`);

  // Create a new changeset through the API.
  const generateChangeset = () => {
    return new Promise((resolve, reject) => {
      let changeset = {
        type: 'changeset',
        tags: {
          comment: `Finish project setup. Project ${projId}, Scenario ${scId}`,
          created_by: 'RRA'
        }
      };
      createChangeset(db)(changeset, (err, id, node) => {
        if (err) return reject(err);
        return resolve(id);
      });
    });
  };

  // Create an OSM Change file and store it in system /tmp folder.
  const createOSMChange = (id) => {
    return new Promise((resolve, reject) => {
      // OGR reads from a file
      fs.writeFileSync(`${basePath}.osm`, roadNetwork);

      // Use ogr2osm with:
      // -t - a custom translation file. Default only removes empty values
      // -o - to specify output file
      // -f - to force overwrite
      let cmd = path.resolve(__dirname, '../lib/ogr2osm/ogr2osm.py');
      let args = [
        cmd,
        `${basePath}.osm`,
        '-t', './app/lib/ogr2osm/default_translation.py',
        '--changeset-id', id,
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
        return resolve(id);
      });
    });
  };

  // Add data from the OSM Change file to the created changeset.
  const putChangeset = (id) => {
    return new Promise((resolve, reject) => {
      let changes = osm2json({coerceIds: false}).parse(fs.readFileSync(`${basePath}.osmc`));
      if (!changes.length) return reject(new osmP2PErrors.XmlParseError());

      putChanges(db)(changes, id, (err, diffResult) => {
        console.timeEnd('processRoadNetwork');
        if (err) return reject(err);
        return resolve();
      });
    });
  };

  return op.log('process:road-network', {message: 'Road network processing started'})
    .then(() => generateChangeset())
    .then(id => createOSMChange(id))
    .then(id => putChangeset(id))
    // Note: There's no need to close the osm-p2p-db because when the process
    // terminates the connection is automatically closed.
    .then(() => op.log('process:road-network', {message: 'Road network processing finished'}));
}
