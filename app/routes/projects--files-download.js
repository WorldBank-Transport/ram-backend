'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { getFile } from '../s3/utils';
import { FileNotFoundError, getBoomResponseForError } from '../utils/errors';

module.exports = [
  {
    path: '/projects/{projId}/files/{fileId}',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
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
                case 'origins':
                case 'admin-bounds':
                  mime = 'application/json';
                  break;
              }

              reply(dataStream)
                .type(mime)
                .header('Content-Disposition', `attachment; filename=${file.name}`);
            });
        })
        .catch(err => reply(getBoomResponseForError(err)));
    }
  }
];
