'use strict';
import Joi from 'joi';
import Boom from 'boom';

import db from '../db/';

// Number of days the data is considered valid.
export const CACHE_DAYS = 7;

/**
 * Check is a given source has data and is not expired.
 *
 * @param {string} sourceName (origins | profile | admin | poi | road-network)
 */
export function checkValidSource (sourceName) {
  // To check if the data expired or not, check if something is returned
  // Since all data is imported at the same time, it is enough to
  // check one record.
  // Using cacheDays as identifier instead of value to avoid the
  // "could not determine data type of parameter" error.
  return db.raw(`
    SELECT wbcatalog_resources.id, exp.expire_at
    FROM wbcatalog_resources, (
      SELECT created_at + interval ':cacheDays:' day as expire_at
      FROM wbcatalog_resources
      WHERE wbcatalog_resources.type = :type
    ) exp
    WHERE exp.expire_at > now() AND wbcatalog_resources.type = :type
  `, {cacheDays: CACHE_DAYS.toString(), type: sourceName})
  .then(data => !!data.rows.length);
}

/**
 * Fetch data for a given source from the wb catalog.
 *
 * TODO: Implement fetchCatalogData
 *
 * @param {string} sourceName (origins | profile | admin | poi | road-network)
 */
export function fetchCatalogData (sourceName) {
  // Fetch data form the catalog.
  return Promise.resolve([1, 2, 3, 4, 5, 6, 7].map(i => ({
    id: i,
    name: `${sourceName} ${i}`,
    url: `http://example.com/resource/${sourceName}/file.ext`
  })));
}

/**
 * Removes old data from the database and stores the wb catalog data
 * for caching purposes.
 *
 * TODO: Implement buildCache
 *
 * @param {string} sourceName (origins | profile | admin | poi | road-network)
 * @param {array} catalogData Data from the WB catalog as returned by fetchCatalogData()
 *
 * @see fetchCatalogData
 */
export function buildCache (sourceName, catalogData) {
  const data = catalogData.map(o => ({
    type: sourceName,
    name: o.name,
    resource_id: o.id,
    resource_url: o.url
  }));

  return db('wbcatalog_resources')
    .where('type', sourceName)
    .del()
    .then(() => db.batchInsert('wbcatalog_resources', data));
}

/**
 * Gets the data for a given source form the database.
 *
 * @param {string} sourceName (origins | profile | admin | poi | road-network)
 *
 */
export function getResourcesFromDb (sourceName) {
  return db.select('resource_id', 'name')
    .from('wbcatalog_resources')
    .where('type', sourceName)
    .orderBy('name');
}

/**
 * Hapi handler for endpoints.
 */
function wbCatalogHandler (request, reply) {
  const {sourceName} = request.payload;

  checkValidSource(sourceName)
    .then(hasData => !hasData
      ? fetchCatalogData(sourceName).then(catalogData => buildCache(sourceName, catalogData))
      : null // No action
    )
    .then(() => getResourcesFromDb(sourceName))
    .then(data => reply(data))
    .catch(err => {
      console.error(err);
      return reply(Boom.badImplementation(err));
    });
}

export default [
  {
    path: '/projects/wbcatalog-source-data',
    method: 'POST',
    config: {
      validate: {
        payload: {
          sourceName: Joi.string().valid('origins', 'profile', 'admin').required()
        }
      }
    },
    handler: wbCatalogHandler
  },
  {
    path: '/scenarios/wbcatalog-source-data',
    method: 'POST',
    config: {
      validate: {
        payload: {
          sourceName: Joi.string().valid('poi', 'road-network').required()
        }
      }
    },
    handler: wbCatalogHandler
  }
];
