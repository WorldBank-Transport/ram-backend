'use strict';
import path from 'path';
import fs from 'fs-extra';
import bbox from '@turf/bbox';
import centerOfMass from '@turf/center-of-mass';
import _ from 'lodash';
import Promise from 'bluebird';

import config from '../../config';
import db from '../../db/';
import Operation from '../../utils/operation';
import { setScenarioSetting, getScenarioSetting, getPropInsensitive } from '../../utils/utils';
import { createAdminBoundsVT, createRoadNetworkVT } from '../../utils/vector-tiles';
import {
  getFileInfo,
  getFileContents,
  getJSONFileContents,
  putFileStream,
  removeFile
} from '../../s3/utils';
import { importRoadNetwork, importPOI, removeDatabase } from '../rra-osm-p2p';
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

    if (!adminBoundsFc.features) {
      throw new Error('Invalid administrative boundaries file');
    }

    const filteredAA = {
      'type': 'FeatureCollection',
      'features': adminBoundsFc.features
        .filter(o => !!o.properties[getPropInsensitive(o.properties, 'name')] && o.geometry.type !== 'Point')
        .map(o => {
          // Normalize name prop.
          o.properties.name = o.properties[getPropInsensitive(o.properties, 'name')];
          return o;
        })
    };

    const adminAreaTask = () => {
      return db.transaction(function (trx) {
        let adminAreas = _(filteredAA.features)
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

        let adminAreasBbox = bbox(filteredAA);

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
    const cleanAATable = () => {
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

    // Update the admin bounds file with the filtered features.
    // A clean file is needed for the VT generation.
    const updateFile = () => {
      const fc = {
        'type': 'FeatureCollection',
        'features': filteredAA.features.map(o => ({
          type: 'Feature',
          properties: {
            name: o.properties.name,
            type: o.properties.type || 'admin-area',
            project_id: projId
          },
          geometry: o.geometry
        }))
      };

      const fileName = `admin-bounds_${Date.now()}`;
      const filePath = `project-${projId}/${fileName}`;

      // Get current file and remove it
      return db('projects_files')
        .select('*')
        .where('project_id', projId)
        .where('type', 'admin-bounds')
        .first()
        .then(file => removeFile(file.path)
          //  Put the new file.
          .then(() => putFileStream(filePath, JSON.stringify(fc)))
          .then(() => file.id)
        )
        // Update the db
        .then(fileId => db('projects_files')
          .update({
            name: fileName,
            path: filePath,
            updated_at: (new Date())
          })
          .where('id', fileId)
        )
        .then(() => filePath);
    };

    return op.log('process:admin-bounds', {message: 'Processing admin areas'})
      .then(() => cleanAATable())
      .then(() => adminAreaTask())
      .then(() => updateFile())
      .then(filePath => process.env.DS_ENV === 'test' ? null : createAdminBoundsVT(projId, scId, op, filePath).promise);
  }

  function processOrigins (originsData) {
    logger && logger.log('process origins');

    let originsTask = () => {
      let indicators = originsData.data.indicators;
      let neededProps = indicators.map(o => o.key);

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
              name: feat.properties[getPropInsensitive(feat.properties, 'name')] || 'N/A',
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

    let importOSMRoadNetworkTask = () => overpass.importRoadNetwork(bbox)
      .catch(err => {
        // Just to log error
        logger && logger.log('Error importing from overpass', err.message);
        throw err;
      })
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
          .then(() => db('scenarios_files').insert(data))
          .then(() => data);
      });

    // Clean the tables so any remnants of previous attempts are removed.
    // This avoids primary keys collisions and duplication.
    let cleanTable = () => {
      return db('scenarios_files')
        .where('project_id', projId)
        .where('scenario_id', scId)
        .where('type', 'road-network')
        .del();
    };

    return op.log('process:road-network', {message: 'Importing road network from OSM'})
      .then(() => cleanTable())
      .then(() => importOSMRoadNetworkTask());
  }

  function importOSMPOIs (bbox, poiTypes) {
    logger && logger.log('Importing pois from overpass for bbox (S,W,N,E):', bbox);
    logger && logger.log('POI types:', poiTypes);

    let importOSMPOIsTask = () => overpass.importPOI(bbox, poiTypes)
      .catch(err => {
        // Just to log error
        logger && logger.log('Error importing from overpass', err.message);
        throw err;
      })
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

        return Promise.all(promises)
          .then(() => osmGeoJSON);
      });

    // Clean the tables so any remnants of previous attempts are removed.
    // This avoids primary keys collisions and duplication.
    let cleanTable = () => {
      return db('scenarios_files')
        .where('project_id', projId)
        .where('scenario_id', scId)
        .where('type', 'poi')
        .del();
    };

    return op.log('process:poi', {message: 'Importing poi from OSM'})
      .then(() => cleanTable())
      .then(() => importOSMPOIsTask());
  }

  function copyDefaultProfile (projId) {
    let fileName = `profile_${Date.now()}`;
    let filePath = `project-${projId}/${fileName}`;

    return putFileStream(filePath, fs.createReadStream(path.resolve(__dirname, '../../utils/default.profile.lua')))
      .then(() => db('projects_files')
        .insert({
          name: fileName,
          type: 'profile',
          path: filePath,
          project_id: projId,
          created_at: (new Date()),
          updated_at: (new Date())
        })
      );
  }

  let op = new Operation(db);
  op.loadById(opId)
  .then(() => Promise.all([
    // Get source for Road Network and Poi.
    db('scenarios_source_data')
      .select('*')
      .where('scenario_id', scId)
      .whereIn('name', ['poi', 'road-network'])
      .orderBy('name'),
    // Get source for Profile.
    db('projects_source_data')
      .select('*')
      .where('project_id', projId)
      .whereIn('name', ['profile'])
      .orderBy('name'),
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
    let [[poiSource, rnSource], [profileSource], [adminBoundsFc, originsData]] = filesContent;

    //
    // Handle Road Network.
    let rnProcessPromise = () => {
      let executor = Promise.resolve();

      // Both return the db entry for the file.
      if (rnSource.type === 'osm') {
        executor = importOSMRoadNetwork(overpass.fcBbox(adminBoundsFc));
      } else {
        executor = db('scenarios_files')
          .select('*')
          .where('project_id', projId)
          .where('type', 'road-network')
          .first();
      }

      executor = executor
        .then(file => Promise.all([file.path, getFileInfo(file.path)]))
        .then(([filePath, fileInfo]) => {
          // Disable road network editing if size over threshold.
          let allowImport = fileInfo.size < config.roadNetEditThreshold;
          return setScenarioSetting(db, scId, 'rn_active_editing', allowImport)
            .then(() => {
              if (allowImport) {
                return getFileContents(filePath)
                  .then(roadNetwork => {
                    let rnLogger = appLogger.group(`p${projId} s${scId} rn import`);
                    rnLogger && rnLogger.log('process road network');
                    return importRoadNetwork(projId, scId, op, roadNetwork, rnLogger);
                  });
              }
            })
            .then(() => process.env.DS_ENV === 'test' ? null : createRoadNetworkVT(projId, scId, op, filePath).promise);
        });

      return executor;
    };

    //
    // Handle POI.
    let poiProcessPromise = poiSource.type === 'osm'
      ? () => importOSMPOIs(overpass.fcBbox(adminBoundsFc), poiSource.data.osmPoiTypes)
      // We'll need to get the POI contents to import to the osm-p2p-db.
      : () => db('scenarios_files')
        .select('*')
        .where('project_id', projId)
        .where('scenario_id', scId)
        .where('type', 'poi')
        .then(files => Promise.all([
          files,
          Promise.map(files, file => getJSONFileContents(file.path))
        ])
        .then(([files, filesContent]) => {
          // Create an object indexed by poi type.
          let pois = {};
          files.forEach((f, idx) => { pois[f.subtype] = filesContent[idx]; });
          return pois;
        }));

    //
    // Handle Profile.
    let profileProcessPromise = profileSource.type === 'default'
      ? () => copyDefaultProfile(projId)
      : () => Promise.resolve();

    return processOrigins(originsData)
      .then(() => processAdminAreas(adminBoundsFc))
      .then(() => profileProcessPromise())
      // Remove anything that might be there. We're importing fresh data.
      .then(() => removeDatabase(projId, scId))
      .then(() => rnProcessPromise())
      .then(() => poiProcessPromise()
        .then(poisFC => {
          // Check rn_active_editing setting to see if we need to import.
          return getScenarioSetting(db, scId, 'rn_active_editing')
            .then(editing => {
              if (!editing) {
                return;
              }
              // Merge all feature collection together.
              // Add a property to keep track of the poi type.
              let fc = {
                type: 'FeatureCollection',
                features: Object.keys(poisFC).reduce((acc, key) => {
                  let feats = poisFC[key].features;
                  feats.forEach(f => { f.properties.ram_poi_type = key; });
                  return acc.concat(feats);
                }, [])
              };

              let poiLogger = appLogger.group(`p${projId} s${scId} poi import`);
              poiLogger && poiLogger.log('process poi');
              return importPOI(projId, scId, op, fc, poiLogger);
            });
        })
      );
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
      ]);
    })
    .then(() => op.log('success', {message: 'Operation complete'}).then(op => op.finish()));
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
