'use strict';
import Joi from 'joi';
import Boom from 'boom';
import centerOfMass from '@turf/center-of-mass';

import db from '../db/';
import { getJSONFileContents } from '../s3/utils';
import { FileNotFoundError } from '../utils/errors';

export default [
  {
    path: '/projects/{projId}/scenarios/{scId}/poi',
    method: 'GET',
    config: {
      validate: {
        params: {
          projId: Joi.number(),
          scId: Joi.number()
        },
        query: {
          type: Joi.string().required()
        }
      }
    },
    handler: (request, reply) => {
      const { projId, scId } = request.params;
      const { type } = request.query;

      db('scenarios_files')
        .select('*')
        .where('project_id', projId)
        .where('scenario_id', scId)
        .where('type', `poi`)
        .where('subtype', type)
        .first()
        .then(file => {
          if (!file) throw new FileNotFoundError('Poi type not found');
          return getJSONFileContents(file.path);
        })
        .then(poi => {
          let response = [];
          poi.features.forEach((feat, idx) => {
            let coords = feat.geometry.type !== 'Point'
              ? centerOfMass(feat).geometry.coordinates
              : feat.geometry.coordinates;

            // The response will be converted to a feature on the client.
            // This way we reduce the response size by a lot.
            response.push({
              // feature id.
              i: idx,
              // Coordinates.
              c: [parseInt(coords[0] * 1e5) / 1e5, parseInt(coords[1] * 1e5) / 1e5]
            });
          });

          return response;
        })
        .then(res => reply(res))
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
