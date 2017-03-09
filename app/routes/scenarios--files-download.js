'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { getFile } from '../s3/utils';
import { FileNotFoundError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/scenarios/{scId}/files/{fileId}',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number(),
          fileId: Joi.number()
        },
        query: {
          download: Joi.boolean().truthy('true').falsy('false')
        }
      }
    },
    handler: (request, reply) => {
      if (!request.query.download) {
        return reply(Boom.notImplemented('Query parameter "download" missing'));
      }

      db('scenarios_files')
        .select('*')
        .where('id', request.params.fileId)
        .where('project_id', request.params.projId)
        .where('scenario_id', request.params.scId)
        .then(res => {
          if (!res.length) throw new FileNotFoundError();
          return res[0];
        })
        .then(file => {
          return getFile(file.path)
            .then(dataStream => {
              let mime;
              switch (file.type) {
                case 'poi':
                  mime = 'application/json';
                  break;
                case 'road-network':
                  mime = 'application/xml';
                  break;
              }

              reply(dataStream)
                .type(mime)
                .header('Content-Disposition', `attachment; filename=${file.name}`);
            });
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
