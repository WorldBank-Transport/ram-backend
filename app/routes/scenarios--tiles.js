'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';
import { ScenarioNotFoundError } from '../utils/errors';
import { getFile } from '../s3/utils';

module.exports = [
  {
    path: '/projects/{projId}/scenarios/{scId}/tiles/{type}/{z}/{x}/{y}',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number().required(),
          scId: Joi.number().required(),
          type: Joi.string().valid('road-network'),
          z: Joi.number().required(),
          x: Joi.number().required(),
          y: Joi.number().required()
        }
      }
    },
    handler: (request, reply) => {
      return reply(Boom.notImplemented('This method is not implemented'));
      /* eslint-disable */
      const { scId, type, z, x, y } = request.params;

      return db.select('*')
        .from('scenarios')
        .where('id', scId)
        .first()
        .then(project => {
          if (!project) throw new ScenarioNotFoundError();
        })
        .then(() => getFile(`scenario-${scId}/tiles/${type}/${z}/${x}/${y}.pbf`))
        .then(file => {
          reply(file)
            .type('application/octet-stream')
            .header('Content-Encoding', 'gzip');
        })
        .catch(ScenarioNotFoundError, e => reply(Boom.notFound(e.message)))
        .catch(err => {
          if (err.code === 'NoSuchKey') {
            return reply(Boom.notFound('Tile not found'));
          }
          console.log('err', err);
          reply(Boom.badImplementation(err));
        });
    }
  }
];
