'use strict';
import Joi from 'joi';
import Boom from 'boom';
import Promise from 'bluebird';
import Zip from 'node-zip';
import _ from 'lodash';

import db from '../db/';
import {
  putFile as putFileToS3,
  removeLocalFile,
  removeFile,
  getLocalJSONFileContents,
  getFileContents
} from '../s3/utils';
import {
  ProjectNotFoundError,
  ScenarioNotFoundError,
  FileExistsError,
  DataValidationError,
  ProjectStatusError,
  FileNotFoundError
} from '../utils/errors';
import { parseFormData } from '../utils/utils';
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
        maxBytes: 1 * Math.pow(1024, 3), // 1GB
        output: 'stream',
        parse: false,
        allow: 'multipart/form-data'
      }
    },
    handler: (request, reply) => {
      const projId = parseInt(request.params.projId);
      const scId = parseInt(request.params.scId);

      // Check if project exists and is still in setup phase.
      db('projects')
        .select('*')
        .where('id', projId)
        .first()
        .then(project => {
          if (!project) throw new ProjectNotFoundError();
          if (project.status !== 'pending') throw new ProjectStatusError('Project no longer in the setup phase. Source data can not be uploaded');
        })
        .then(() => db('scenarios')
          .select('id')
          .where('id', scId)
          .first()
          .then(scenario => { if (!scenario) throw new ScenarioNotFoundError(); })
        )
        .then(() => parseFormData(request.raw.req))
        .then(result => {
          if (!result.fields['source-type']) {
            throw new DataValidationError('"source-type" is required');
          }

          if (!result.fields['source-name']) {
            throw new DataValidationError('"source-name" is required');
          }

          let sourceType = result.fields['source-type'][0];
          let sourceName = result.fields['source-name'][0];

          // Functions for the different source names / types combinations.
          const resolverMatrix = {
            poi: {
              file: () => handleFileSource(),
              osm: () => handleOSMSource(),
              wbcatalog: () => wbcatalogResolver()
            },
            'road-network': {
              file: () => handleFileSource(),
              osm: () => handleOSMSource(),
              wbcatalog: () => wbcatalogResolver()
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

          const handleFileSource = () => {
            if (!result.files.file) {
              throw new DataValidationError('"file" is required');
            }

            // With poi source the subtype is required.
            let subtype = result.fields['subtype'] ? result.fields['subtype'][0] : null;
            if (sourceName === 'poi' && !subtype) {
              throw new DataValidationError('"subtype" is required for source "poi"');
            }

            let file = result.files.file[0];
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
            return getScenarioSource(scId, sourceName)
              .then(source => {
                // Delete files.
                return source && source.type !== 'file'
                  ? deleteScenarioFiles(projId, scId, sourceName)
                  : null;
              })
              // Upsert source.
              .then(() => upsertScenarioSource(projId, scId, sourceName, 'file'))
              // Check if the file exists.
              .then(() => {
                let query = db('scenarios_files')
                  .select('id')
                  .where('scenario_id', scId)
                  .where('type', sourceName);

                if (subtype) {
                  query = query.where('subtype', subtype);
                }

                return query;
              })
              .then(files => {
                if (files.length) { throw new FileExistsError(); }
              })
              // Validations.
              .then(() => {
                if (sourceName === 'poi') {
                  return getLocalJSONFileContents(file.path)
                    .catch(err => {
                      if (err instanceof SyntaxError) throw new DataValidationError(`Invalid GeoJSON file`);
                      throw err;
                    })
                    .then(contents => {
                      if (contents.type !== 'FeatureCollection') {
                        throw new DataValidationError('GeoJSON file must be a feature collection');
                      }

                      if (!contents.features || !contents.features.length) {
                        throw new DataValidationError('No valid poi found in file');
                      }
                    });
                }
              })
              // Upload to S3.
              .then(() => putFileToS3(filePath, file.path))
              // Insert into database.
              .then(() => {
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

                return db('scenarios_files')
                  .returning(['id', 'name', 'type', 'subtype', 'path', 'created_at'])
                  .insert(data)
                  .then(insertResponse => insertResponse[0])
                  .then(insertResponse => db('scenarios').update({updated_at: (new Date())}).where('id', scId).then(() => insertResponse))
                  .then(insertResponse => db('projects').update({updated_at: (new Date())}).where('id', projId).then(() => insertResponse));
              })
              // Delete temp file.
              .then(insertResponse => removeLocalFile(file.path, true).then(() => insertResponse))
              .then(insertResponse => reply(Object.assign({}, insertResponse, {
                sourceType,
                sourceName
              })))
              .catch(err => {
                // Delete temp file in case of error. Re-throw error to continue.
                file && removeLocalFile(file.path, true);
                throw err;
              });
          };

          const handleOSMSource = () => {
            // With poi source the osmPoiTypes are required.
            let osmPoiTypes = result.fields['osmPoiTypes'] || [];
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
            return upsertScenarioSource(projId, scId, sourceName, 'osm', sourceData)
              // Delete files if exist.
              .then(() => deleteScenarioFiles(projId, scId, sourceName))
              .then(() => reply({
                sourceType,
                sourceName
              }));
          };

          const wbcatalogResolver = () => {
            try {
              var keys = result.fields['wbcatalog-options[key]'].filter(o => !!o);
            } catch (e) {
              throw new DataValidationError('"wbcatalog-options[key]" is required');
            }

            if (!keys.length) {
              throw new DataValidationError('"wbcatalog-options[key]" must not be empty');
            }

            let sourceData;
            if (sourceName === 'poi') {
              try {
                var labels = result.fields['wbcatalog-options[label]'].filter(o => !!o);
              } catch (e) {
                throw new DataValidationError('"wbcatalog-options[label]" is required');
              }

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
              sourceData = { resources: [{ key: result.fields['wbcatalog-options[key]'][0] }] };
            } else {
              throw new DataValidationError(`Invalid source: ${sourceName}`);
            }

            // Upsert source.
            return upsertScenarioSource(projId, scId, sourceName, 'wbcatalog', sourceData)
              // Delete files if exist.
              .then(() => deleteScenarioFiles(projId, scId, sourceName))
              .then(() => reply({
                sourceType,
                sourceName
              }));
          };

          // Get the right resolver and start the process.
          return resolverMatrix[sourceName][sourceType]();
        })
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(FileExistsError, e => reply(Boom.conflict(e.message)))
        .catch(ProjectStatusError, e => reply(Boom.badRequest(e.message)))
        .catch(DataValidationError, e => reply(Boom.badRequest(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
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
        .catch(FileNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(err => {
          if (err.code === 'NoSuchKey') {
            return reply(Boom.notFound('File not found in storage bucket'));
          }
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
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
