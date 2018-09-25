'use strict';
import Joi from 'joi';

import db from '../db/';
import { ProjectNotFoundError, getBoomResponseForError } from '../utils/errors';
import { getFile } from '../s3/utils';

module.exports = [
  {
    path: '/projects/{projId}/tiles/{type}/{z}/{x}/{y}',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number().required(),
          type: Joi.string().valid('admin-bounds'),
          z: Joi.number().required(),
          x: Joi.number().required(),
          y: Joi.number().required()
        }
      }
    },
    handler: (request, reply) => {
      const { projId, type, z, x, y } = request.params;

      return db.select('*')
        .from('projects')
        .where('id', request.params.projId)
        .first()
        .then(project => {
          if (!project) throw new ProjectNotFoundError();
        })
        .then(() => getFile(`project-${projId}/tiles/${type}/${z}/${x}/${y}.pbf`))
        .then(file => {
          reply(file)
            .type('application/octet-stream')
            .header('Content-Encoding', 'gzip');
        })
        .catch(err => reply(getBoomResponseForError(err)));
    }
  }
];
