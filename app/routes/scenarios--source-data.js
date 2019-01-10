'use strict';
import os from 'os';
import path from 'path';
import Joi from 'joi';
import Promise from 'bluebird';
import Zip from 'node-zip';
import _ from 'lodash';

import db from '../db/';
import {
  putFile as putFileToS3,
  removeLocalFile,
  removeFile,
  getLocalJSONFileContents,
  getFileContents,
  writeFileStreamPromise
} from '../s3/utils';
import {
  ProjectNotFoundError,
  ScenarioNotFoundError,
  FileExistsError,
  DataValidationError,
  ProjectStatusError,
  FileNotFoundError,
  getBoomResponseForError
} from '../utils/errors';
import { osmPOIGroups } from '../utils/overpass';

export default [
  {
    path: '/projects/{projId}/scenarios/{scId}/source-data',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        }
      },
      payload: {
        maxBytes: 2 * Math.pow(1024, 3), // 2GB
        output: 'stream',
        parse: true,
        allow: 'multipart/form-data'
      }
    },
    handler: async (request, reply) => {
      const projId = parseInt(request.params.projId);
      const scId = parseInt(request.params.scId);

      const tempFilename = `ram-p${projId}-s${scId}--${Date.now()}`;
      const tempFilePath = path.join(os.tmpdir(), tempFilename);

      try {
        if (request.payload.file) {
          await writeFileStreamPromise(request.payload.file, tempFilePath);
        }

        // Check if project exists and is still in setup phase.
        const project = await db('projects')
          .select('*')
          .where('id', projId)
          .first();
        if (!project) throw new ProjectNotFoundError();
        if (project.status !== 'pending') throw new ProjectStatusError('Project no longer in the setup phase. Source data can not be uploaded');

        // Check if the scenario exists.
        const scenario = await db('scenarios')
          .select('id')
          .where('id', scId)
          .first();
        if (!scenario) throw new ScenarioNotFoundError();

        const payload = request.payload;

        if (!payload['source-type']) {
          throw new DataValidationError('"source-type" is required');
        }

        if (!payload['source-name']) {
          throw new DataValidationError('"source-name" is required');
        }

        let sourceType = payload['source-type'];
        let sourceName = payload['source-name'];

        const handleFileSource = async () => {
          if (!payload.file) {
            throw new DataValidationError('"file" is required');
          }

          // With poi source the subtype is required.
          let subtype = payload.subtype;
          if (sourceName === 'poi' && !subtype) {
            throw new DataValidationError('"subtype" is required for source "poi"');
          }

          let fileName;

          if (subtype) {
            fileName = `${sourceName}_${subtype}_${Date.now()}`;
          } else {
            fileName = `${sourceName}_${Date.now()}`;
          }

          let filePath = `scenario-${scId}/${fileName}`;

          // When switching from a source to File, check if there are any
          // files in the db and remove them. This can happen if files were
          // imported from OSM/catalog but the process failed.
          const source = await getScenarioSource(scId, sourceName);
          if (source && source.type !== 'file') {
            // Delete files.
            await deleteScenarioFiles(projId, scId, sourceName);
          }

          // Upsert source.
          await upsertScenarioSource(projId, scId, sourceName, 'file');

          // Check if the file exists.
          let query = db('scenarios_files')
            .select('id')
            .where('scenario_id', scId)
            .where('type', sourceName);

          if (subtype) {
            query = query.where('subtype', subtype);
          }

          const files = await query;
          if (files.length) { throw new FileExistsError(); }

          // Validations.
          if (sourceName === 'poi') {
            let contents;
            try {
              contents = await getLocalJSONFileContents(tempFilePath);
            } catch (error) {
              if (error instanceof SyntaxError) throw new DataValidationError(`Invalid GeoJSON file`);
              throw error;
            }
            if (contents.type !== 'FeatureCollection') {
              throw new DataValidationError('GeoJSON file must be a feature collection');
            }

            if (!contents.features || !contents.features.length) {
              throw new DataValidationError('No valid poi found in file');
            }
          }

          // Upload to S3.
          await putFileToS3(filePath, tempFilePath);

          // Insert into database.
          let data = {
            name: fileName,
            type: sourceName,
            path: filePath,
            project_id: projId,
            scenario_id: scId,
            created_at: (new Date()),
            updated_at: (new Date())
          };

          if (subtype) {
            data.subtype = subtype;
          }

          const insertResponse = await db('scenarios_files')
            .returning(['id', 'name', 'type', 'subtype', 'path', 'created_at'])
            .insert(data);
          // Update timestamps.
          await db('scenarios').update({updated_at: (new Date())}).where('id', scId);
          await db('projects').update({updated_at: (new Date())}).where('id', projId);
          // Delete temp file.
          await removeLocalFile(tempFilePath, true);

          return reply({
            ...insertResponse[0],
            sourceType,
            sourceName
          });
        };

        const handleOSMSource = async () => {
          // With poi source the osmPoiTypes are required.
          // Cast to array.
          let osmPoiTypes = [].concat(payload.osmPoiTypes).filter(o => !!o);
          if (sourceName === 'poi') {
            // Validate POI.
            if (!osmPoiTypes.length) {
              throw new DataValidationError('"osmPoiTypes" is required for source "poi"');
            }

            let validPOI = osmPOIGroups.map(o => o.key);
            let invalid = osmPoiTypes.filter(o => validPOI.indexOf(o) === -1);
            if (invalid.length) {
              throw new DataValidationError(`POI type [${invalid.join(', ')}] not allowed. "osmPoiTypes" values must be any of [${validPOI.join(', ')}]`);
            }
          }

          let sourceData = osmPoiTypes ? { osmPoiTypes } : null;

          // Upsert source.
          await upsertScenarioSource(projId, scId, sourceName, 'osm', sourceData);
          // Delete files if exist.
          await deleteScenarioFiles(projId, scId, sourceName);
          return reply({
            sourceType,
            sourceName
          });
        };

        const wbcatalogResolver = async () => {
          if (payload['wbcatalog-options[key]'] === undefined) {
            throw new DataValidationError('"wbcatalog-options[key]" is required');
          }
          // Cast to array.
          const keys = [].concat(payload['wbcatalog-options[key]']).filter(o => !!o);
          if (!keys.length) {
            throw new DataValidationError('"wbcatalog-options[key]" must not be empty');
          }

          let sourceData;
          if (sourceName === 'poi') {
            if (payload['wbcatalog-options[label]'] === undefined) {
              throw new DataValidationError('"wbcatalog-options[label]" is required');
            }
            // Cast to array.
            const labels = [].concat(payload['wbcatalog-options[label]']).filter(o => !!o);

            if (!labels.length) {
              throw new DataValidationError('"wbcatalog-options[label]" must not be empty');
            }

            if (labels.length !== keys.length) {
              throw new DataValidationError('"wbcatalog-options[key]" and "wbcatalog-options[label]" must have the same number of values');
            }
            sourceData = { resources: _.zipWith(keys, labels, (k, l) => ({key: k, label: l})) };
          } else if (sourceName === 'road-network') {
            // The catalog data is stored as an array of objects to be
            // consistent throughout all sources, since the POI source
            // can have multiple options with labels.
            sourceData = { resources: [{ key: keys[0] }] };
          } else {
            throw new DataValidationError(`Invalid source: ${sourceName}`);
          }

          // Upsert source.
          await upsertScenarioSource(projId, scId, sourceName, 'wbcatalog', sourceData);
          // Delete files if exist.
          await deleteScenarioFiles(projId, scId, sourceName);
          return reply({
            sourceType,
            sourceName
          });
        };

        // Functions for the different source names / types combinations.
        const resolverMatrix = {
          poi: {
            file: handleFileSource,
            osm: handleOSMSource,
            wbcatalog: wbcatalogResolver
          },
          'road-network': {
            file: handleFileSource,
            osm: handleOSMSource,
            wbcatalog: wbcatalogResolver
          }
        };

        const allowedSourceNames = Object.keys(resolverMatrix);
        if (allowedSourceNames.indexOf(sourceName) === -1) {
          throw new DataValidationError(`"source-name" must be one of [${allowedSourceNames.join(', ')}]`);
        }

        const allowedSourceTypes = Object.keys(resolverMatrix[sourceName]);
        if (allowedSourceTypes.indexOf(sourceType) === -1) {
          throw new DataValidationError(`"source-type" for "${sourceName}" must be one of [${allowedSourceTypes.join(', ')}]`);
        }

        // Get the right resolver and start the process.
        await resolverMatrix[sourceName][sourceType]();
      } catch (error) {
        // Delete temp file in case of error. Re-throw error to continue.
        request.payload.file && removeLocalFile(tempFilePath, true);
        return reply(getBoomResponseForError(error));
      }
    }
  },
  {
    path: '/projects/{projId}/scenarios/{scId}/source-data',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        },
        query: {
          download: Joi.boolean().truthy('true').falsy('false').required(),
          type: Joi.string().valid(['poi', 'road-network']).required()
        }
      }
    },
    handler: (request, reply) => {
      const { projId, scId } = request.params;

      db('scenarios_files')
        .select('*')
        .where('type', request.query.type)
        .where('project_id', projId)
        .where('scenario_id', scId)
        .then(files => {
          if (!files.length) throw new FileNotFoundError();
          return files;
        })
        .then(files => {
          let zip = new Zip();
          return Promise.map(files, file => getFileContents(file.path)
            .then(content => {
              let name;
              switch (file.type) {
                case 'poi':
                  name = `${file.name}.geojson`;
                  break;
                case 'road-network':
                  name = `${file.name}.osm`;
                  break;
              }
              zip.file(name, content);
            })
          )
          .then(() => zip.generate({ base64: false, compression: 'DEFLATE' }))
          // Send!
          .then(data => reply(data)
            .type('application/zip')
            .encoding('binary')
            .header('Content-Disposition', `attachment; filename=${files[0].type}-p${projId}s${scId}.zip`)
          );
        })
        .catch(err => reply(getBoomResponseForError(err)));
    }
  }
];

function deleteScenarioFiles (projId, scId, sourceName) {
  return db('scenarios_files')
    .where('project_id', projId)
    .where('scenario_id', scId)
    .where('type', sourceName)
    .then(files => {
      if (files.length) {
        // Remove files from DB.
        return db('scenarios_files')
          .whereIn('id', files.map(o => o.id))
          .del()
          // Remove files from storage.
          .then(() => Promise.map(files, file => removeFile(file.path)));
      }
    });
}

function getScenarioSource (scId, sourceName) {
  return db('scenarios_source_data')
    .select('id', 'type')
    .where('scenario_id', scId)
    .where('name', sourceName)
    .first();
}

function upsertScenarioSource (projId, scId, sourceName, sourceType, sourceData) {
  return getScenarioSource(scId, sourceName)
    .then(source => {
      if (source) {
        return db('scenarios_source_data')
          .update({type: sourceType, data: sourceData ? JSON.stringify(sourceData) : null})
          .where('id', source.id);
      } else {
        return db('scenarios_source_data')
          .insert({
            project_id: projId,
            scenario_id: scId,
            name: sourceName,
            type: sourceType,
            data: sourceData ? JSON.stringify(sourceData) : null
          });
      }
    });
}
