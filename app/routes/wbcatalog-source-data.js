'use strict';
import Joi from 'joi';
import Boom from 'boom';
import fetch from 'node-fetch';
import Promise from 'bluebird';
import _ from 'lodash';
import https from 'https';

import db from '../db/';

// Number of days the data is considered valid.
export const CACHE_DAYS = 7;

// https://github.com/WorldBank-Transport/ram-backend/issues/214#issuecomment-394736868
const SOURCE_TO_TAG_ID = {
  // ram-origins
  origins: -1,
  // ram-profile
  profile: -1,
  // ram-admin
  admin: 1413,
  // ram-poi
  poi: -1,
  // ram-rn
  'road-network': 1412
};

// Allow unauthorized requests.
// https://github.com/WorldBank-Transport/ram-backend/issues/223
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

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
  // .then(data => false);
}

async function fetchResourceData (sourceName, resource) {
  try {
    const fileId = _.get(resource, 'field_resources.und[0].target_id', null);
    if (!fileId) throw new Error('File id not found in resource');

    const data = await fetch(`https://datacatalog.worldbank.org/api/3/action/resource_show?id=${fileId}`, {agent: httpsAgent})
      .then(res => res.json());

    // TODO: Validate mimetype based on sourceName.

    return {
      id: resource.nid,
      name: resource.title,
      url: data.result.url
    };
  } catch (error) {
    console.log('Error fetching file resource for', sourceName, error);
    console.log('The resource', resource);
    // Invalidate source in case of any error.
    return {id: null};
  }
}

/**
 * Fetch data for a given source from the wb catalog.
 *
 *
 * @param {string} sourceName (origins | profile | admin | poi | road-network)
 */
export async function fetchCatalogData (sourceName) {
  const tagId = SOURCE_TO_TAG_ID[sourceName];

  const data = await fetch(`https://datacatalog.worldbank.org/search-service/search_api/datasets?filter[field_tags]=${tagId}&fields=title,nid,field_resources`, {agent: httpsAgent})
    .then(res => res.json());

  // Build concurrent tasks.
  const tasks = _.map(data.result, resource => () => fetchResourceData(sourceName, resource));
  const files = await Promise.map(tasks, task => task(), {concurrency: 5});

  // Remove the invalid results.
  return files.filter(f => !!f.id);
}

/**
 * Removes old data from the database and stores the wb catalog data
 * for caching purposes.
 *
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
async function wbCatalogHandler (request, reply) {
  const {sourceName} = request.payload;

  try {
    const hasData = await checkValidSource(sourceName);
    if (hasData) {
      const catalogData = await fetchCatalogData(sourceName);
      await buildCache(sourceName, catalogData);
    }
    const data = await getResourcesFromDb(sourceName);
    return reply(data);
  } catch (err) {
    console.error(err);
    return reply(Boom.badImplementation(err));
  }
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