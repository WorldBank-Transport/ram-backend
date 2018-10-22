'use strict';
import path from 'path';
import obj2osm from 'obj2osm';
import osmP2PApi from 'osm-p2p-server/api/index';
import through2 from 'through2';
import osmtogeojson from 'osmtogeojson';

import config from '../../config';
import { getDatabase } from '../rra-osm-p2p';
import db from '../../db/';
import { putFileStream, removeFile } from '../../s3/utils';
import Operation from '../../utils/operation';
import AppLogger from '../../utils/app-logger';

const DEBUG = config.debug;
let appLogger = AppLogger({ output: DEBUG });
let logger;

process.on('message', function (e) {
  // Capture all the errors.
  try {
    logger = appLogger.group(`p${e.projId} s${e.scId} exp-rn`);
    logger.log('init');
    e.callback = (err) => {
      if (err) return process.exit(1);
      else process.exit(0);
    };
    exportRoadNetwork(e);
  } catch (err) {
    process.send({type: 'error', data: err.message, stack: err.stack});
    throw err;
  }
});

// The export road network script is setup so that it run on a different
// node process using fork. This allows us to offload the main server
// not causing blocking operations.

/**
 * Exports the road network from the osm-p2p-db and converts it to osm
 * format to be consumed by osrm. The resulting data is uploaded directly
 * to the s3 bucket.
 *
 * @param  {object} e       Data.
 *         e.opId           Operation Id. It has to be already started.
 *         e.projId         Project Id.
 *         e.scId           Scenario Id.
 *         e.callback
 */
export function exportRoadNetwork (e) {
  const {opId, projId, scId, callback} = e;

  let op = new Operation(db);
  op.loadById(opId)
    .then(op => op.log('road-network', {message: 'Updating road network and pois'}))
    // Load scenario poi types.
    .then(() => db('scenarios_files')
      .select('subtype')
      .where('type', 'poi')
      .where('project_id', projId)
      .where('scenario_id', scId)
      .then(types => types.map(o => o.subtype))
    )
    .then(poiTypes => {
      const bbox = [-180, -90, 180, 90];
      const toOsmOptions = {
        bounds: {minlon: bbox[0], minlat: bbox[1], maxlon: bbox[2], maxlat: bbox[3]}
      };
      const osmDb = getDatabase(projId, scId);
      const formatTransform = obj2osm(toOsmOptions);

      formatTransform.on('error', (err) => {
        throw err;
      });

      logger && logger.log('Exporting data from osm-p2p');

      let stream = osmP2PApi(osmDb).getMap(bbox, {order: 'type'})
        .pipe(processOSMP2PExport());

      // Extract the POI into a promise and continue with the road network.
      let splitting = collectPOIs(stream, poiTypes);

      stream = splitting.stream.pipe(formatTransform);

      function processRN () {
        const fileName = `road-network_${Date.now()}`;
        const filePath = `scenario-${scId}/${fileName}`;

        return putFileStream(filePath, stream)
          // Get previous file.
          .then(() => db('scenarios_files')
            .select('path')
            .where('type', 'road-network')
            .where('project_id', projId)
            .where('scenario_id', scId)
            .first()
          )
          // Delete from storage.
          .then(file => removeFile(file.path))
          // Add entry to the database
          .then(() => db('scenarios_files')
            .update({
              name: fileName,
              path: filePath,
              updated_at: (new Date())
            })
            .where('type', 'road-network')
            .where('project_id', projId)
            .where('scenario_id', scId)
          );
      }

      function processPOI () {
        return splitting.deferred
          // Convert to Feature Collection from Overpass style nodes.
          .then(data => {
            let fc = osmtogeojson({elements: data});
            // Group features by its ram_poi_type.
            let groups = fc.features.reduce((acc, feat) => {
              let type = feat.properties.ram_poi_type;
              if (!acc[type]) {
                acc[type] = {
                  type: 'FeatureCollection',
                  features: []
                };
              }
              acc[type].features.push(feat);
              return acc;
            }, {});

            return groups;
          })
          .then(groups => Promise.all(Object.keys(groups).map(key => {
            const fileName = `poi_${key}_${Date.now()}`;
            const filePath = `scenario-${scId}/${fileName}`;

            let data = JSON.stringify(groups[key]);

            return putFileStream(filePath, data)
              // Get previous file.
              .then(() => db('scenarios_files')
                .select('id', 'path')
                .where('type', 'poi')
                .where('subtype', key)
                .where('project_id', projId)
                .where('scenario_id', scId)
                .first()
              )
              // Delete from storage.
              .then(file => removeFile(file.path)
                .then(() => file.id)
              )
              // Add entry to the database
              .then(id => db('scenarios_files')
                .update({
                  name: fileName,
                  path: filePath,
                  updated_at: (new Date())
                })
                .where('type', 'poi')
                .where('id', id)
                .where('project_id', projId)
                .where('scenario_id', scId)
              );
          })));
      }

      return processRN()
        .then(() => processPOI())
        .then(() => logger && logger.log('Exporting data from osm-p2p... done'));
    })
    // Note: There's no need to close the osm-p2p-db because when the process
    // terminates the connection is automatically closed.
    .then(() => {
      logger && logger.log('process complete');
      DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../export-road-network_p${projId}s${scId}.log`));
      callback();
    })
    .catch(err => {
      logger && logger.log('error', err);
      DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../export-road-network_p${projId}s${scId}.log`));
      return op.finish('error', {error: err.message})
        .then(() => callback(err.message), () => callback(err.message));
    });
}

/**
 * Clean data exported from  osm-p2p-db so it can be used by osrm.
 * Deletes attributes: version, timestamp, changeset.
 * Assigns new ids to nodes and ways.
 * Requires that nodes appear before ways.
 *
 * @return Stream transform function
 */
function processOSMP2PExport () {
  let c = 0;
  const newId = () => ++c;
  let ids = {};

  return through2.obj((data, enc, cb) => {
    delete data.version;
    delete data.timestamp;
    delete data.changeset;

    if (!ids[data.id]) ids[data.id] = newId();

    data.id = ids[data.id];

    if (data.nodes) data.nodes = data.nodes.map(n => ids[n]);

    cb(null, data);
  });
}

function collectPOIs (stream, poiTypes) {
  let rn = [];
  let pois = [];
  let nodeStack = {};

  // Create a sort of deferred.
  // This promise will collect the POI and return them for
  // later processing.
  let _resolve;
  const deferred = new Promise((resolve) => {
    _resolve = resolve;
  });

  let dbgSkipped = 0;

  const write = (data, enc, next) => {
    if (data.type === 'node') {
      if (data.tags && data.tags.amenity) {
        // Discard nodes with ram_poi_type different than what was uploaded.
        if (data.tags.ram_poi_type && poiTypes.indexOf(data.tags.ram_poi_type) !== -1) {
          pois.push(data);
        } else {
          dbgSkipped++;
        }
      } else {
        nodeStack[data.id] = data;
      }
    } else if (data.type === 'way') {
      if (data.tags && data.tags.amenity) {
        // Discard ways with ram_poi_type different than what was uploaded.
        if (data.tags.ram_poi_type && poiTypes.indexOf(data.tags.ram_poi_type) !== -1) {
          pois.push(data);
          data.nodes.forEach(n => {
            if (nodeStack[n]) {
              pois.push(nodeStack[n]);
              delete nodeStack[n];
            }
          });
        } else {
          dbgSkipped++;
        }
      } else {
        rn.push(data);
        data.nodes.forEach(n => {
          if (nodeStack[n]) {
            rn.push(nodeStack[n]);
            delete nodeStack[n];
          }
        });
      }
    }
    next();
  };

  const end = function (next) {
    DEBUG && console.log('collectPOIs', 'missing/invalid ram_poi_type', dbgSkipped);
    // Sort.
    pois.sort(a => a.type === 'node' ? -1 : 1);
    setImmediate(() => _resolve(pois));

    rn.sort(a => a.type === 'node' ? -1 : 1);
    rn.forEach(o => this.push(o));
    next();
  };

  stream = stream.pipe(through2.obj(write, end));
  return {stream, deferred};
}
