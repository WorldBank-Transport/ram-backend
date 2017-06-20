'use strict';
import Joi from 'joi';
import Boom from 'boom';
import _ from 'lodash';
import Promise from 'bluebird';
import Zip from 'node-zip';

import db from '../db/';
import { putFile as putFileToS3, removeLocalFile, getLocalJSONFileContents, getFileContents } from '../s3/utils';
import {
  ProjectNotFoundError,
  FileExistsError,
  FileNotFoundError,
  DataValidationError,
  ProjectStatusError
} from '../utils/errors';
import { parseFormData } from '../utils/utils';

export default [
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

          if (sourceType !== 'file') {
            throw new DataValidationError(`"source-type" must be one of [file]`);
          }

          if (['admin-bounds', 'profile', 'origins'].indexOf(sourceName) === -1) {
            throw new DataValidationError(`"source-name" must be one of [admin-bounds, profile, origins]`);
          }

          // Store the file if there is one.
          // File must exist when the source is not origins, but that's
          // checked afterwards.
          let file = result.files.file ? result.files.file[0] : null;
          let resolver;
          // Origins need to be handled differently.
          if (sourceName === 'origins') {
            resolver = handleOrigins(result, projId);
          } else {
            if (!result.files.file) {
              throw new DataValidationError('"file" is required');
            }

            let fileName = `${sourceName}_${Date.now()}`;
            let filePath = `profile-${projId}/${fileName}`;

            // Upsert source.
            resolver = upsertSource(sourceName, 'file', projId)
              // Check if the file exists.
              .then(() => db('projects_files')
                .select('id')
                .where('project_id', projId)
                .where('type', sourceName)
              )
              .then(files => {
                if (files.length) { throw new FileExistsError(); }
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
                  created_at: (new Date()),
                  updated_at: (new Date())
                };

                return db('projects_files')
                  .returning(['id', 'name', 'type', 'path', 'created_at'])
                  .insert(data)
                  .then(insertResponse => insertResponse[0]);
              })
              // Delete temp file.
              .then(insertResponse => removeLocalFile(file.path, true).then(() => insertResponse));
          }

          return resolver
            .then(insertResponse => db('projects').update({updated_at: (new Date())}).where('id', projId).then(() => insertResponse))
            .then(insertResponse => reply(Object.assign({}, insertResponse, {
              sourceType,
              sourceName
            })))
            .catch(err => {
              // Delete temp file in case of error. Re-throw error to continue.
              file && removeLocalFile(file.path, true);
              throw err;
            });
        })
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(FileExistsError, e => reply(Boom.conflict(e.message)))
        .catch(DataValidationError, e => reply(Boom.badRequest(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
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

function handleOrigins (result, projId) {
  let sourceName = result.fields['source-name'][0];

  if (!result.fields['available-ind']) {
    throw new DataValidationError('"available-ind" is required');
  }
  if (!result.fields['indicators[key]']) {
    throw new DataValidationError('"indicators[key]" is required');
  }
  if (!result.fields['indicators[label]']) {
    throw new DataValidationError('"indicators[label]" is required');
  }

  // Data from the stream.
  let availableInd = result.fields['available-ind'];
  let indicatorKeys = result.fields['indicators[key]'];
  let indicatorLabels = result.fields['indicators[label]'];

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
        let filePath = `profile-${projId}/${fileName}`;

        // File was submitted. There can't be one in the database.
        return db('projects_files')
          .select('*')
          .where('project_id', projId)
          .where('type', sourceName)
          .then(files => {
            if (files.length) { throw new FileExistsError(); }
          })
          .then(() => getLocalJSONFileContents(file.path))
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

function upsertSource (sourceName, type, projId) {
  return db('projects_source_data')
    .select('id')
    .where('project_id', projId)
    .where('name', sourceName)
    .first()
    .then(source => {
      if (source) {
        // No need.
        // return db('projects_source_data')
        //   .update({type: type})
        //   .where('id', source.id);
      } else {
        return db('projects_source_data')
          .insert({
            project_id: projId,
            name: sourceName,
            type: type
          });
      }
    });
}
