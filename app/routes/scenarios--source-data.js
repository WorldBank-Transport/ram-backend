'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { putFile as putFileToS3, removeLocalFile } from '../s3/utils';
import {
  ProjectNotFoundError,
  ScenarioNotFoundError,
  FileExistsError,
  DataValidationError,
  ProjectStatusError
} from '../utils/errors';
import { parseFormData } from '../utils/utils';

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
          .where('id', projId)
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

          if (['poi', 'road-network'].indexOf(sourceName) === -1) {
            throw new DataValidationError(`"source-name" must be one of [poi, road-network]`);
          }

          switch (sourceType) {
            case 'file':
              if (!result.files.file) {
                throw new DataValidationError('"file" is required');
              }

              // With poi source the subtype is required.
              let subtype = result.fields['subtype'][0];
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

              // Upsert source.
              return db('scenarios_source_data')
                .select('id')
                .where('scenario_id', scId)
                .where('name', sourceName)
                .first()
                .then(source => {
                  if (source) {
                    return db('scenarios_source_data')
                      .update({type: 'file'})
                      .where('id', source.id);
                  } else {
                    return db('scenarios_source_data')
                      .insert({
                        project_id: projId,
                        scenario_id: scId,
                        name: sourceName,
                        type: 'file'
                      });
                  }
                })
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
            case 'osm':
              throw new DataValidationError(`"osm" type not implemented`);
              // break;
            default:
              throw new DataValidationError(`"source-type" must be one of [osm, file]`);
          }
        })
        .catch(ProjectNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(FileExistsError, e => reply(Boom.conflict(e.message)))
        .catch(DataValidationError, e => reply(Boom.badRequest(e.message)))
        .catch(err => {
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
