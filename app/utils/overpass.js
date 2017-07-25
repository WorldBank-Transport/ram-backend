'use strict';
import rp from 'request-promise';
import promiseRetry from 'promise-retry';
import bbox from '@turf/bbox';
import osmtogeojson from 'osmtogeojson';

/**
 * Queries Overpass and returns the data as a string.
 *
 * @param {string} query The Overpass QL query
 */
export function query (format, query) {
  return promiseRetry((retry, number) => {
    console.log('Fetching data from Overpass... Attempt number:', number);
    return rp(`http://overpass-api.de/api/interpreter?data=[out:${format}];${query}`)
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

function handleOverpassSilentError (osmData) {
  let remark = null;

  // Handle response in xml format.
  if (typeof osmData === 'string') {
    let remarkTest = osmData.match('<remark>(.*)</remark>');

    if (remarkTest) {
      remark = remarkTest[1];
    }

  // Handle response in json format.
  } else {
    if (osmData.remark) {
      remark = osmData.remark;
    }
  }

  if (remark) {
    if (remark.match('Query run out of memory') || remark.match('Query timed out in')) {
      throw new Error('Area is too complex to import from OSM');
    }

    throw new Error(remark);
  }

  return osmData;
}

export function importRoadNetwork (bbox) {
  let ql = `(
    way["highway"]["highway"!~"^footway$|^path$|^bridleway$|^steps$|^pedestrian$"](${bbox});
    >;
  ); out body;`;

  return query('xml', ql)
    .then(handleOverpassSilentError);
}

export function importPOI (bbox, poiTypes) {
  // Pois selected
  let poiGroupsSelected = osmPOIGroups.filter(o => poiTypes.indexOf(o.key) !== -1);

  // Flatten the queries.
  let queries = poiGroupsSelected.reduce((acc, val) => acc.concat(val.queries), []);

  // Compute the queries. (Transform from object to string)
  queries = queries.map(q => {
    let val = q.values.map(v => `^${v}$`).join('|');
    return `"${q.key}"~"${val}"`;
  });

  let ql = `(
    ${queries.map(q => (`
      node[${q}](${bbox});
      way[${q}](${bbox});
    `)).join('')}
    >;
  ); out body;`;

  // Query will look something like:
  // (
  //    node["amenity"~"^clinic$|^doctors$|^hospital$"](-11.89,-38.313,-10.5333431,-37.1525399);
  //    way["amenity"~"^clinic$|^doctors$|^hospital$"](-11.89,-38.313,-10.5333431,-37.1525399);
  //    >;
  // ); out body;

  return query('json', ql)
    .then(osmData => JSON.parse(osmData))
    .then(handleOverpassSilentError)
    .then(osmJSON => osmtogeojson(osmJSON, { flatProperties: true }))
    .then(osmGeo => {
      // Prepare the response object with a feature collection per POI type.
      let poiFCs = {};
      poiGroupsSelected.forEach(group => {
        poiFCs[group.key] = {
          type: 'FeatureCollection',
          features: []
        };
      });

      // Group the feature by poi key
      osmGeo.features.forEach(feat => {
        poiGroupsSelected.forEach(group => {
          if (isFeatureInGroup(feat, group)) {
            poiFCs[group.key].features.push(feat);
          }
        });
      });

      return poiFCs;
    });
}

function isFeatureInGroup (feat, group) {
  // If the feature has any of the properties used to query it then it belongs
  // to the group.
  return group.queries.some(query => {
    let prop = feat.properties[query.key];
    return prop && query.values.indexOf(prop) !== -1;
  });
}

export const osmPOIGroups = [
  {
    key: 'health',
    queries: [
      // Will be converted into:
      // '"amenity"~"^clinic$|^doctors$|^hospital$"'
      {
        key: 'amenity',
        values: ['clinic', 'doctors', 'hospital']
      }
    ]
  },
  {
    key: 'education',
    queries: [
      {
        key: 'amenity',
        values: ['college', 'kindergarten', 'school', 'university']
      }
    ]
  },
  {
    key: 'financial',
    queries: [
      {
        key: 'amenity',
        values: ['atm', 'bank', 'bureau_de_change']
      }
    ]
  }
];
