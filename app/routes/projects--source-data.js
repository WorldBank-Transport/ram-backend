'use strict';
import fs from 'fs-extra';
import path from 'path';
import Joi from 'joi';
import _ from 'lodash';
import Promise from 'bluebird';
import Zip from 'node-zip';

import db from '../db/';
import { putFile as putFileToS3, putFileStream, removeFile, removeLocalFile, getLocalJSONFileContents, getFileContents } from '../s3/utils';
import {
  ProjectNotFoundError,
  FileExistsError,
  FileNotFoundError,
  DataValidationError,
  ProjectStatusError,
  getBoomResponseForError
} from '../utils/errors';
import { parseFormData, getPropInsensitive } from '../utils/utils';
import { getOSRMProfileDefaultSpeedSettings, renderProfileFile, getOSRMProfileDefaultSpeedMeta } from '../utils/osrm-profile';

const profileValidationSchema = Object.keys(getOSRMProfileDefaultSpeedSettings())
  .reduce((acc, setting) => {
    // Ensure that the values are all numeric and the keys are correct.
    acc[setting] = Joi.object().pattern(/^[0-9a-zA-Z_:-]+$/, Joi.number()).required();
    return acc;
  }, {});

export default [
  {
    path: '/files/source-data/default.profile.lua',
    method: 'GET',
    handler: (request, reply) => {
      reply(fs.createReadStream(path.resolve(__dirname, '../utils/default.profile.lua')));
    }
  },
  {
    path: '/projects/{projId}/source-data',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
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

      // Check if project exists and is still in setup phase.
      db('projects')
        .select('*')
        .where('id', projId)
        .first()
        .then(project => {
          if (!project) throw new ProjectNotFoundError();
          if (project.status !== 'pending') throw new ProjectStatusError('Project no longer in the setup phase. Source data can not be uploaded');
        })
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

          // Store the file if there is one. It may be needed later for cleanup.
          // File must exist when the source is not origins, but that's
          // checked afterwards. Origin file may not be needed if we're just
          // updating selected indicators.
          let uploadedFilePath = result.files.file ? result.files.file[0].path : null;

          const wbcatalogResolver = () => {
            try {
              var keys = result.fields['wbcatalog-options[key]'].filter(o => !!o);
            } catch (e) {
              throw new DataValidationError('"wbcatalog-options[key]" is required');
            }

            if (!keys.length) {
              throw new DataValidationError('"wbcatalog-options[key]" must not be empty');
            }

            // The catalog data is stored as an array of objects to be
            // consistent throughout all sources, since the POI source
            // can have multiple options with labels.
            let sourceData = {resources: [{ key: keys[0] }]};

            return simpleSourceUpdate(sourceName, sourceType, projId, sourceData);
          };

          // Functions for the different source names / types combinations.
          const resolverMatrix = {
            profile: {
              file: () => handleProfileAndAdmin(sourceName, uploadedFilePath, projId),
              default: () => simpleSourceUpdate(sourceName, sourceType, projId),
              wbcatalog: () => wbcatalogResolver()
            },
            origins: {
              file: () => handleOrigins(result, projId),
              wbcatalog: () => wbcatalogResolver()
            },
            'admin-bounds': {
              file: () => handleProfileAndAdmin(sourceName, uploadedFilePath, projId),
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

          // Get the right resolver and start the process.
          return resolverMatrix[sourceName][sourceType]()
            .then(insertResponse => db('projects').update({updated_at: (new Date())}).where('id', projId).then(() => insertResponse))
            .then(insertResponse => reply(Object.assign({}, insertResponse, {
              sourceType,
              sourceName
            })))
            .catch(err => {
              // Delete temp file in case of error. Re-throw error to continue.
              uploadedFilePath && removeLocalFile(uploadedFilePath, true);
              throw err;
            });
        })
        .catch(err => reply(getBoomResponseForError(err)));
    }
  },
  {
    path: '/projects/{projId}/source-data',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        query: {
          download: Joi.boolean().truthy('true').falsy('false').required(),
          type: Joi.string().valid(['profile', 'origins', 'admin-bounds']).required()
        }
      }
    },
    handler: (request, reply) => {
      const { projId } = request.params;

      db('projects_files')
        .select('*')
        .where('type', request.query.type)
        .where('project_id', projId)
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
                case 'profile':
                  name = `${file.name}.lua`;
                  break;
                case 'origins':
                case 'admin-bounds':
                  name = `${file.name}.geojson`;
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
            .header('Content-Disposition', `attachment; filename=${files[0].type}-p${projId}.zip`)
          );
        })
        .catch(err => reply(getBoomResponseForError(err)));
    }
  },
  {
    path: '/projects/{projId}/source-data/editor',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        query: {
          type: Joi.string().valid(['profile']).required()
        }
      }
    },
    handler: async (request, reply) => {
      const { projId } = request.params;

      try {
        const project = await db('projects')
          .select('*')
          .where('id', projId)
          .first();

        if (!project) throw new ProjectNotFoundError();
        if (project.status === 'pending') throw new ProjectStatusError('Project setup not completed');

        // Get source data for the profile.
        const sourceData = await db('projects_source_data')
          .select('*')
          .where('project_id', projId)
          .where('name', 'profile')
          .first();

        return reply({
          sections: getOSRMProfileDefaultSpeedMeta(),
          settings: sourceData.data.settings
        });
      } catch (err) {
        return reply(getBoomResponseForError(err));
      }
    }
  },
  {
    path: '/projects/{projId}/source-data/editor',
    method: 'POST',
    config: {
      validate: {
        params: {
          projId: Joi.number()
        },
        query: {
          type: Joi.string().valid(['profile']).required()
        },
        payload: profileValidationSchema
      }
    },
    handler: async (request, reply) => {
      const { projId } = request.params;
      const settings = request.payload;

      try {
        const project = await db('projects')
          .select('*')
          .where('id', projId)
          .first();

        if (!project) throw new ProjectNotFoundError();
        if (project.status === 'pending') throw new ProjectStatusError('Project setup not completed');

        // Update source data.
        await db('projects_source_data')
          .update({
            data: { settings }
          })
          .where('project_id', projId)
          .where('name', 'profile');

        const fileName = `profile_${Date.now()}`;
        const filePath = `project-${projId}/${fileName}`;
        const profile = renderProfileFile(settings);

        await putFileStream(filePath, profile);
        await db('projects_files')
          .update({
            name: fileName,
            path: filePath,
            updated_at: (new Date())
          })
          .where('project_id', projId)
          .where('type', 'profile');

        return reply({statusCode: 200, message: 'Profile settings uploaded'});
      } catch (err) {
        return reply(getBoomResponseForError(err));
      }
    }
  }
];

function handleProfileAndAdmin (sourceName, uploadedFilePath, projId) {
  if (!uploadedFilePath) {
    return Promise.reject(new DataValidationError('"file" is required'));
  }

  let fileName = `${sourceName}_${Date.now()}`;
  let filePath = `project-${projId}/${fileName}`;

  // Upsert source.
  return upsertSource(sourceName, 'file', projId)
    // Check if the file exists.
    .then(() => db('projects_files')
      .select('id')
      .where('project_id', projId)
      .where('type', sourceName)
    )
    .then(files => {
      if (files.length) { throw new FileExistsError(); }
    })
    // Validations.
    .then(() => {
      if (sourceName === 'admin-bounds') {
        return getLocalJSONFileContents(uploadedFilePath)
          .catch(err => {
            if (err instanceof SyntaxError) throw new DataValidationError('Invalid GeoJSON file');
            throw err;
          })
          .then(contents => {
            if (contents.type !== 'FeatureCollection') {
              throw new DataValidationError('GeoJSON file must be a feature collection');
            }

            if (!contents.features || !contents.features.length) {
              throw new DataValidationError('No valid admin areas found in file');
            }

            // Features without name.
            let noName = contents.features.filter(o => !o.properties[getPropInsensitive(o.properties, 'name')]);
            if (noName.length) {
              throw new DataValidationError(`All features must have a "name". Found ${noName.length} features without a "name" property`);
            }

            // Point features.
            let noPoly = contents.features.filter(o => o.geometry.type !== 'Polygon' && o.geometry.type !== 'MultiPolygon');
            if (noPoly.length) {
              throw new DataValidationError(`All features must be a "Polygon" or a "MultiPolygon". Found ${noPoly.length} invalid features`);
            }
          });
      }
    })
    // Upload to S3.
    .then(() => putFileToS3(filePath, uploadedFilePath))
    // Insert into database.
    .then(() => {
      let data = {
        name: fileName,
        type: sourceName,
        path: filePath,
        project_id: projId,
        created_at: (new Date()),
        updated_at: (new Date())
      };

      return db('projects_files')
        .returning(['id', 'name', 'type', 'path', 'created_at'])
        .insert(data)
        .then(insertResponse => insertResponse[0]);
    })
    // Delete temp file.
    .then(insertResponse => removeLocalFile(uploadedFilePath, true).then(() => insertResponse));
}

function handleOrigins (result, projId) {
  let sourceName = result.fields['source-name'][0];

  const check = (key) => {
    try {
      var val = result.fields[key].filter(o => !!o);
    } catch (e) {
      throw new DataValidationError(`"${key}" is required`);
    }

    if (!val.length) {
      throw new DataValidationError(`"${key}" must not be empty`);
    }
    return val;
  };

  var availableInd = check('available-ind');
  var indicatorKeys = check('indicators[key]');
  var indicatorLabels = check('indicators[label]');

  if (indicatorKeys.length !== indicatorLabels.length) {
    throw new DataValidationError('"indicators[key]" and "indicators[label]" must have the same number of values');
  }

  // Are the submitted indicatorKeys in the available indicators.
  let validKeys = indicatorKeys.every(k => availableInd.indexOf(k) !== -1);
  if (!validKeys) {
    throw new DataValidationError('Submitted indicator keys are not listed as available');
  }

  let indicators = _.zipWith(indicatorKeys, indicatorLabels, (k, l) => ({key: k, label: l}));

  return upsertSource(sourceName, 'file', projId)
    .then(() => {
      // Is there a file?
      let file = result.files.file ? result.files.file[0] : null;

      // If there is, validate indicators against it.
      if (file) {
        let fileName = `${sourceName}_${Date.now()}`;
        let filePath = `project-${projId}/${fileName}`;

        // File was submitted. There can't be one in the database.
        return db('projects_files')
          .select('*')
          .where('project_id', projId)
          .where('type', sourceName)
          .then(files => {
            if (files.length) { throw new FileExistsError(); }
          })
          .then(() => getLocalJSONFileContents(file.path))
          .catch(err => {
            if (err instanceof SyntaxError) throw new DataValidationError('Invalid GeoJSON file');
            throw err;
          })
          .then(contents => {
            // Get the indicator common to every feature. Number indicators only.
            let indicatorsInFile = contents.features.map(o => {
              let numberKeys = [];
              Object.keys(o.properties).forEach(k => {
                if (!isNaN(parseInt(o.properties[k]))) {
                  numberKeys.push(k);
                }
              });
              return numberKeys;
            });
            let intersect = indicatorsInFile.shift();
            indicatorsInFile.every(o => {
              intersect = intersect.filter(i => o.indexOf(i) !== -1);
              return !!intersect.length;
            });
            indicatorsInFile = intersect;

            // indicatorsInFile must be the same as availableInd.
            if (indicatorsInFile.length !== availableInd.length || _.intersection(indicatorsInFile, availableInd).length !== indicatorsInFile.length) {
              throw new DataValidationError('Submitted available indicators do not match file attributes');
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
              data: JSON.stringify({ indicators, availableInd }),
              project_id: projId,
              created_at: (new Date()),
              updated_at: (new Date())
            };

            return db('projects_files')
              .returning(['id', 'name', 'type', 'path', 'data', 'created_at'])
              .insert(data)
              .then(insertResponse => insertResponse[0]);
          })
          // Delete temp file.
          .then(insertResponse => removeLocalFile(file.path, true).then(() => insertResponse));

      // If not, validate against the database.
      } else {
        // File was not submitted. There HAS to be one in the database.
        return db('projects_files')
          .select('*')
          .where('project_id', projId)
          .where('type', sourceName)
          .then(files => {
            if (!files.length) { throw new FileNotFoundError(); }
            return files[0].data;
          })
          .then(indicatorData => {
            let storedIndicators = indicatorData.availableInd;
            // Available indicators must be the same as the ones stores in
            // the db.
            if (storedIndicators.length !== availableInd.length || _.intersection(storedIndicators, availableInd).length !== storedIndicators.length) {
              throw new DataValidationError('Submitted available indicators do not match stored attributes');
            }
          })
          // Update database.
          .then(() => {
            let data = {
              data: JSON.stringify({ indicators, availableInd }),
              updated_at: (new Date())
            };

            return db('projects_files')
              .update(data, ['id', 'name', 'type', 'path', 'data', 'created_at'])
              .where('project_id', projId)
              .where('type', sourceName)
              .then(insertResponse => insertResponse[0]);
          });
      }
    });
}

function upsertSource (sourceName, type, projId, sourceData) {
  return db('projects_source_data')
    .select('id')
    .where('project_id', projId)
    .where('name', sourceName)
    .first()
    .then(source => {
      if (source) {
        return db('projects_source_data')
          .update({type: type, data: sourceData ? JSON.stringify(sourceData) : null})
          .where('id', source.id);
      } else {
        return db('projects_source_data')
          .insert({
            project_id: projId,
            name: sourceName,
            type: type,
            data: sourceData ? JSON.stringify(sourceData) : null
          });
      }
    });
}

/**
 * Updates the source by setting the type and some data.
 * Deletes any file that was updated.
 * This method is only useful for source types other than file.
 *
 * @param {string} sourceName Name of the source
 * @param {string} sourceType Type of the source
 * @param {int} projId Project id
 * @param {object} sourceData Additional data to store
 */
function simpleSourceUpdate (sourceName, sourceType, projId, sourceData) {
  return upsertSource(sourceName, sourceType, projId, sourceData)
  // Check if the file exists.
  .then(() => db('projects_files')
    .select('id', 'path')
    .where('project_id', projId)
    .where('type', sourceName)
  )
  .then(files => {
    if (files.length) {
      // Remove files from DB.
      return db('projects_files')
        .whereIn('id', files.map(o => o.id))
        .del()
        // Remove files from storage.
        .then(() => Promise.map(files, file => removeFile(file.path)));
    }
  });
}
