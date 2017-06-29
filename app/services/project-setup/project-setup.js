'use strict';
import path from 'path';
import bbox from '@turf/bbox';
import centerOfMass from '@turf/center-of-mass';
import _ from 'lodash';

import config from '../../config';
import db from '../../db/';
import Operation from '../../utils/operation';
import { getJSONFileContents, putFileStream } from '../../s3/utils';
// import { getFileContents, getJSONFileContents } from '../../s3/utils';
// import { importRoadNetwork } from '../rra-osm-p2p';
import AppLogger from '../../utils/app-logger';
import * as overpass from '../../utils/overpass';

const DEBUG = config.debug;
let appLogger = AppLogger({ output: DEBUG });
let logger;

process.on('message', function (e) {
  // Capture all the errors.
  try {
    logger = appLogger.group(`p${e.projId} s${e.scId} proj-setup`);
    logger.log('init');
    e.callback = (err) => {
      if (err) return process.exit(1);
      else process.exit(0);
    };
    concludeProjectSetup(e);
  } catch (err) {
    process.send({type: 'error', data: err.message, stack: err.stack});
    throw err;
  }
});

// The project setup script is setup so that it run on a different node process
// using fork. This allows us to offload the main server not causing blocking
// operations.

/**
 * Finishes the project setup by processing all the needed files:
 * Road network:
 *   - Convert the osm file to a changeset and import it to the osm-p2p-db
 * Admin Bound:
 *   - Extract all the village names, and store them on the database. This is
 *   needed to later select what admin areas are to be processed.
 *
 * @param  {object} e       Data.
 *         e.opId           Operation Id. It has to be already started.
 *         e.projId         Project Id.
 *         e.scId           Scenario Id.
 *         e.callback
 */
export function concludeProjectSetup (e) {
  const {opId, projId, scId, callback} = e;

  function processAdminAreas (adminBoundsFc) {
    logger && logger.log('process admin areas');

    let adminAreaTask = () => {
      return db.transaction(function (trx) {
        if (!adminBoundsFc.features) {
          throw new Error('Invalid administrative boundaries file');
        }
        let adminAreas = _(adminBoundsFc.features)
          .filter(o => !!o.properties.name && o.geometry.type !== 'Point')
          .sortBy(o => _.kebabCase(o.properties.name))
          .map(o => {
            return {
              name: o.properties.name,
              type: o.properties.type || 'Admin Area',
              geometry: JSON.stringify(o.geometry.coordinates),
              project_id: projId
            };
          })
          .value();

        let adminAreasBbox = bbox(adminBoundsFc);

        return Promise.all([
          trx('projects')
            .update({
              bbox: JSON.stringify(adminAreasBbox),
              updated_at: (new Date())
            })
            .where('id', projId),

          trx.batchInsert('projects_aa', adminAreas)
            .returning('id'),

          trx('scenarios_settings')
            .insert({
              scenario_id: scId,
              key: 'admin_areas',
              value: '[]',
              created_at: (new Date()),
              updated_at: (new Date())
            })
            .where('id', projId)
        ]);
      });
    };

    // Clean the tables so any remnants of previous attempts are removed.
    // This avoids primary keys collisions.
    let cleanAATable = () => {
      return Promise.all([
        db('projects_aa')
          .where('project_id', projId)
          .del(),
        db('scenarios_settings')
          .where('scenario_id', scId)
          .where('key', 'admin_areas')
          .del()
      ]);
    };

    return op.log('process:admin-bounds', {message: 'Processing admin areas'})
      .then(() => cleanAATable())
      .then(() => adminAreaTask());
  }

  function processOrigins (originsData) {
    logger && logger.log('process origins');

    let originsTask = () => {
      let indicators = originsData.data.indicators;
      let neededProps = indicators.map(o => o.key);
      neededProps.push('name');

      return getJSONFileContents(originsData.path)
        .then(originsFC => {
          logger && logger.log('origins before filter', originsFC.features.length);
          let features = originsFC.features.filter(feat => {
            let props = Object.keys(feat.properties);
            return neededProps.every(o => props.indexOf(o) !== -1);
          });

          logger && logger.log('origins after filter', features.length);

          let originsIndicators = [];
          let origins = features.map(feat => {
            let coordinates = feat.geometry.type === 'Point'
              ? feat.geometry.coordinates
              : centerOfMass(feat).geometry.coordinates;

            // Will be flattened later.
            // The array is constructed in this way so we can match the index of the
            // results array and attribute the correct id.
            let featureIndicators = indicators.map(ind => ({
              key: ind.key,
              label: ind.label,
              value: parseInt(feat.properties[ind.key])
            }));
            originsIndicators.push(featureIndicators);

            return {
              project_id: projId,
              name: feat.properties.name,
              coordinates: JSON.stringify(coordinates)
            };
          });

          return db.transaction(function (trx) {
            return trx.batchInsert('projects_origins', origins)
              .returning('id')
              .then(ids => {
                // Add ids to the originsIndicators and flatten the array in the process.
                let flat = [];
                originsIndicators.forEach((resInd, resIdx) => {
                  resInd.forEach(ind => {
                    ind.origin_id = ids[resIdx];
                    flat.push(ind);
                  });
                });
                return flat;
              })
              .then(data => trx.batchInsert('projects_origins_indicators', data));
          });
        });
    };

    // Clean the tables so any remnants of previous attempts are removed.
    // This avoids primary keys collisions.
    let cleanOriginsTable = () => {
      return db('projects_origins')
        .where('project_id', projId)
        .del();
    };

    return op.log('process:origins', {message: 'Processing origins'})
      .then(() => cleanOriginsTable())
      .then(() => originsTask());
  }

  function importOSMRoadNetwork (bbox) {
    logger && logger.log('Importing road network from overpass for bbox (S,W,N,E):', bbox);
    return op.log('process:road-network', {message: 'Importing road network from OSM'})
      .then(() => overpass.importRoadNetwork(bbox))
      .then(osmData => {
        logger && logger.log('Got road network. Saving to S3 and db');
        // Insert file into DB.
        let fileName = `road-network_${Date.now()}`;
        let filePath = `scenario-${scId}/${fileName}`;
        let data = {
          name: fileName,
          type: 'road-network',
          path: filePath,
          project_id: projId,
          scenario_id: scId,
          created_at: (new Date()),
          updated_at: (new Date())
        };

        return putFileStream(filePath, osmData)
          .then(() => db('scenarios_files').insert(data));
      });
  }

  function importOSMPOIs (bbox, poiTypes) {
    logger && logger.log('Importing pois from overpass for bbox (S,W,N,E):', bbox);
    logger && logger.log('POI types:', poiTypes);
    return op.log('process:poi', {message: 'Importing poi from OSM'})
      .then(() => overpass.importPOI(bbox, poiTypes))
      .then(osmGeoJSON => {
        logger && logger.log('Got POIS. Saving to S3 and db');
        let types = Object.keys(osmGeoJSON);

        let dbInsertions = [];
        let fileUploadPromises = [];
        let emptyPOI = [];

        types.forEach(poiType => {
          // Filter out pois without anything
          if (osmGeoJSON[poiType].features.length) {
            let fileName = `poi_${poiType}_${Date.now()}`;
            let filePath = `scenario-${scId}/${fileName}`;

            // Prepare for db insertion.
            dbInsertions.push({
              name: fileName,
              type: 'poi',
              subtype: poiType,
              path: filePath,
              project_id: projId,
              scenario_id: scId,
              created_at: (new Date()),
              updated_at: (new Date())
            });

            // Save each poi type to S3.
            fileUploadPromises.push(putFileStream(filePath, JSON.stringify(osmGeoJSON[poiType])));
          } else {
            emptyPOI.push(poiType);
          }
        });

        if (emptyPOI.length) {
          logger && logger.log(`No POI were returned for [${emptyPOI.join(', ')}]`);
          throw new Error(`No POI were returned for [${emptyPOI.join(', ')}]`);
        }

        // Save to database.
        let promises = fileUploadPromises.concat(db.batchInsert('scenarios_files', dbInsertions));

        return Promise.all(promises);
      });
  }

  let op = new Operation(db);
  op.loadById(opId)
  .then(() => Promise.all([
    // Get source for Road Network.
    db('scenarios_source_data')
      .select('*')
      .where('scenario_id', scId)
      .whereIn('name', ['poi', 'road-network'])
      .orderBy('name'),
    // db('scenarios_files')
    //   .select('*')
    //   .where('project_id', projId)
    //   .where('type', 'road-network')
    //   .first()
    //   .then(file => getFileContents(file.path)),
    db('projects_files')
      .select('*')
      .where('project_id', projId)
      .whereIn('type', ['admin-bounds', 'origins'])
      .orderBy('type')
      .then(files => {
        // Get the data from the admin bounds file immediately but pass
        // the full data for the origins file because other values from the db
        // are needed.
        let [adminBoundsData, originsData] = files;
        return getJSONFileContents(adminBoundsData.path)
          .then(adminBoundsContent => ([adminBoundsContent, originsData]));
      })
  ]))
  .then(filesContent => {
    // let [roadNetwork, [adminBoundsFc, originsData]] = filesContent;
    let [[poiSource, rnSource], [adminBoundsFc, originsData]] = filesContent;

    let rnProcessPromise = rnSource.type === 'osm'
      ? () => importOSMRoadNetwork(overpass.fcBbox(adminBoundsFc))
      // We'll need to get the files contents to import to
      // the osm-p2p-db. Eventually...
      : () => Promise.resolve();

    let poiProcessPromise = poiSource.type === 'osm'
      ? () => importOSMPOIs(overpass.fcBbox(adminBoundsFc), poiSource.data.osmPoiTypes)
      : () => Promise.resolve();

    // Run the tasks in series rather than in parallel.
    // This is better for error handling. If they run in parallel and
    // `processAdminAreas` errors, the script hangs a bit while
    // `processRoadNetwork` (which is resource intensive) finished and only then
    // the error is captured by the promise.
    // Since processing the admin areas is a pretty fast operation, the
    // performance is not really affected.
    return rnProcessPromise()
      .then(() => poiProcessPromise())
      .then(() => Promise.all([
        processAdminAreas(adminBoundsFc),
        processOrigins(originsData)
      ]));
      // .then(() => {
      //   logger && logger.log('process road network');
      //   return importRoadNetwork(projId, scId, op, roadNetwork);
      // });
  })
  .then(() => {
    return db.transaction(function (trx) {
      return Promise.all([
        trx('projects')
          .update({updated_at: (new Date()), status: 'active'})
          .where('id', projId),
        trx('scenarios')
          .update({updated_at: (new Date()), status: 'active'})
          .where('id', scId)
      ])
      .then(() => op.log('success', {message: 'Operation complete'}).then(op => op.finish()));
    });
  })
  .then(() => {
    logger && logger.log('process complete');
    DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../project-setup_p${projId}s${scId}.log`));
    callback();
  })
  .catch(err => {
    logger && logger.log('error', err);
    DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../project-setup_p${projId}s${scId}.log`));
    return op.log('error', {error: err.message})
      .then(op => op.finish())
      .then(() => callback(err.message), () => callback(err.message));
  });
}
