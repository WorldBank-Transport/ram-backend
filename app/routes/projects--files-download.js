'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { getFile } from '../s3/utils';
import { FileNotFoundError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/files/{fileId}/download',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          fileId: Joi.number()
        }
      }
    },
    handler: (request, reply) => {
      db('projects_files')
        .select('*')
        .where('id', request.params.fileId)
        .where('project_id', request.params.projId)
        .then(res => {
          if (!res.length) throw new FileNotFoundError();
          return res[0];
        })
        .then(file => {
          return getFile(file.path)
            .then(dataStream => {
              let mime;
              switch (file.type) {
                case 'profile':
                  mime = 'text/x-lua';
                  break;
                case 'villages':
                case 'admin-bounds':
                  mime = 'application/json';
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
