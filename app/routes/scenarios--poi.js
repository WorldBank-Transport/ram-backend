'use strict';
import Joi from 'joi';
import centerOfMass from '@turf/center-of-mass';

import db from '../db/';
import { getJSONFileContents } from '../s3/utils';
import { FileNotFoundError, getBoomResponseForError } from '../utils/errors';

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
    handler: async (request, reply) => {
      const { projId, scId } = request.params;
      const { type } = request.query;

      try {
        const fauxFeature = await getFauxPoiFeature(projId, scId, type);
        return reply(fauxFeature);
      } catch (error) {
        return reply(getBoomResponseForError(error));
      }
    }
  }
];

/**
 * Returns a compressed version of a feature to conserve bandwidth. The response
 * should be hydrated to geoJSON on the client.
 *
 * @param {Integer} projId Project id
 * @param {Integer} scId Scenario id
 * @param {string} type Type of the POI
 *
 * @returns {object} compressed POI feature
 */
export async function getFauxPoiFeature (projId, scId, type) {
  const poiFile = await db('scenarios_files')
    .select('*')
    .where('project_id', projId)
    .where('scenario_id', scId)
    .where('type', `poi`)
    .where('subtype', type)
    .first();

  if (!poiFile) throw new FileNotFoundError('Poi type not found');
  const poi = await getJSONFileContents(poiFile.path);

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
}
