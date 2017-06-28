'use strict';
import rp from 'request-promise';
import promiseRetry from 'promise-retry';
import bbox from '@turf/bbox';

/**
 * Queries Overpass and returns the data as a string.
 *
 * @param {string} query The Overpass QL query
 */
export function query (query) {
  return promiseRetry((retry, number) => {
    console.log('Fetching data from Overpass... Attempt number:', number);
    return rp(`http://overpass-api.de/api/interpreter?data=[out:xml];${query}`)
      .catch(err => {
        // API calls to Overpass are rate limited. Retry if statusCode is 429
        if (err.statusCode === 429) {
          retry(err);
        }
        throw err;
      });
  });
}

/**
 * Accepts an array with a bbox in [minX, minY, maxX, maxY] and
 * returns an Overpass bbox.
 *
 * @param {Array} An array with the bounding box [minX, minY, maxX, maxY]
 *
 * @return {String} A string with the bbox (S,W,N,E)
*/
export function convertBbox (bbox) {
  return `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
}

/**
 * Accepts a feature collection a computes the Overpass bbox.
 *
 * @param {Object} Feature Collection
 *
 * @return {String} A string with the bbox (S,W,N,E)
*/
export function fcBbox (fc) {
  return convertBbox(bbox(fc));
}

export function importRoadNetwork (bbox) {
  let ql = `(
    way["highway"~"motorway|primary|secondary|tertiary|service|residential"](${bbox});
    >;
  ); out body;`;

  return query(ql);
}
