'use strict';
import { range, villagesInRegion, poisInBuffer } from './utils';
import async from 'async';

/**
 * Compute the time it takes for each village inside the given work area to
 * reach the closest of each poi type.
 * @param  {Feature} workArea  Area to process.
 * @param  {Object} poiByType  Object where each key represents a poi type and
 *                             the value is a FeatureCollection of points.
 * @param  {FeatureCollection} villages  Points representing villages
 * @param  {Object} osrm       The osrm object as created by new OSRM()
 * @param  {number} maxTime    Value in seconds
 * @param  {number} maxSpeed   Value in km/h
 * @param  {Number} id
 *
 * @return {Function}          Task function for async
 *   When resolved the function will return and array with the properties
 *   of each village plus the shortest time to each poi.
 *   [
 *   {
 *     [propKey]: 'prop value',
 *     [poiType]: 1000,
 *     lat: 0,
 *     long: 0
 *   },
 *   ...
 *   ]
 *   `poiType` is the time in seconds to reach it
 */
export function createProcessAreaTask (workArea, poiByType, villages, osrm, maxTime, maxSpeed, id) {
  return (callback) => {
    if (!workArea) {
      // The square doesn't intersect with the adminArea.
      // Return an empty result.
      process.send({type: 'square', data: 'No intersection', id: id});
      return callback(null, []);
    }

    // Get the villages in the area.
    let workingSet = villagesInRegion(workArea, villages);
    if (workingSet.features.length === 0) {
      // There are no villages within the square.
      // Return an empty result.
      process.send({type: 'square', data: 'No villages', id: id});
      return callback(null, []);
    }

    process.send({type: 'debug', data: `Villages in working set: ${workingSet.features.length}`, id: id});

    let poilist = [];

    // For each POI type (banks, hospitals...) get at least 4 in the area.
    // If there are none increase the search buffer until they're found.
    // TODO: Handle case where there are never at least 4 POIs.
    for (let key in poiByType) {
      let poiSet;
      let time = maxTime;
      let speed = maxSpeed;
      // We want to have at least 4 poi to work with, but we have to account
      // for the case where there are less than 4, as to avoid infinite loops.
      let totalPoi = poiByType[key].features.length;
      let minPoi = Math.min(totalPoi, 4);
      process.send({type: 'debug', data: `Total poi of type ${key}: ${totalPoi}`, id: id});
      do {
        poiSet = poisInBuffer(workArea, poiByType[key], time, speed);
        time += 900;
      } while (poiSet.features.length < minPoi);

      poilist.push({type: key, items: poiSet});
    }

    // Add 'nearest' as a POI type to calculate the distance between village
    // and the nearest road
    poilist.push({type: 'nearest'});

    // Create a flat array of villages coordinates, to be used as source for
    // the routing calculation.
    let villagesCoords = workingSet.features.map(feat => ([feat.geometry.coordinates[0], feat.geometry.coordinates[1]]));
    if (villagesCoords.length === 0) throw new Error('no sources');

    // One task per POI type to calculate the distance from the POI to
    // each one of the villages.
    let poiTypeTasks = poilist.map(poiGroupType => {
      if (poiGroupType.type === 'nearest') {
        return createPoiTypeNearestTask(osrm, villagesCoords);
      } else {
        return createPoiTypeTask(osrm, poiGroupType, villagesCoords);
      }
    });

    // In series, because the main async will keep track of the threadpool
    // and adding parallel tasks here overloads it.
    async.series(poiTypeTasks, (err, poiTime) => {
      // poiTime -> for each poi type an array of the villages indexes and
      // the shortest distance to that poi.
      if (err) {
        throw err;
      }

      // Store the properties of the villages in this square and add
      // additional properties with the time to reach the poi.
      let squareResults = [];

      // Villages properties.
      workingSet.features.forEach((village, villageIdx) => {
        let properties = Object.assign({}, village.properties);
        // Add coordinates.
        properties.lat = village.geometry.coordinates[1];
        properties.lon = village.geometry.coordinates[0];
        // Add time to each poi.
        poiTime.forEach(item => {
          // item.list is an array of values in the same order as the
          // village, hence access by index is fine.
          properties[item.poi] = item.list[villageIdx].eta;
        });

        squareResults.push(properties);
      });

      process.send({type: 'square', data: 'Processed', id: id});
      return callback(null, squareResults);
    });
  };
}

/**
 * Handle POIs of type nearest
 * @param  {Object} osrm           The osrm object as created by new OSRM()
 * @param  {Array} villagesCoords  Array of village coordinates (Points)
 *
 * @return {Function}              Task function for async
 *   When resolved the function will return the shortest time from each village
 *   to the nearest road.
 *   {
 *    poi: 'nearest',
 *    list: [
 *      {
 *        eta: Number
 *      },
 *      ...
 *    ]
 *   }
 *   `list` is ordered the same way as the input `villagesCoords`
 */
export function createPoiTypeNearestTask (osrm, villagesCoords) {
  return (callback) => {
    // Calculate distance from each village to the nearest road segment.
    let nearTasks = villagesCoords.map((village, idx) => {
      return (cb) => {
        osrm.nearest({ coordinates: [village] }, (err, res) => {
          if (err) {
            process.send({type: 'status', data: 'error'});
            console.log('error', err);
            return cb(err);
          }

          var neartime = res.waypoints[0].distance;
          // Return the time taken to reach the point, using the village id
          // as identifier.
          return cb(null, {sourceIdx: idx, time: neartime});
        });
      };
    });

    let results = [];
    // Run the nearest tasks in series, they are pretty fast and
    // otherwise will mess up the async.parallel
    async.series(nearTasks, (err, nearTasksRes) => {
      if (err) {
        console.warn(err);
        return;
      }
      nearTasksRes.forEach(near => { results[near.sourceIdx] = {eta: near.time}; });
      // Return the subcallback (POI level callback)
      return callback(null, { poi: 'nearest', list: results });
    });
  };
}

/**
 * Handle all the other POI types.
 * @param  {Object} osrm           The osrm object as created by new OSRM()
 * @param  {Object} poiGroup       Poi group object
 * @param  {String} poiGroup.type  Type of the poi
 * @param  {Array} poiGroup.items  Feature collection of poi
 * @param  {Array} villagesCoords  Array of village coordinates (Points)
 *
 * @return {Function}              Task function for async
 *   When resolved the function will return the shortest time from each village
 *   to the nearest poi of the given type.
 *   {
 *    poi: 'poi-type',
 *    list: [
 *      {
 *        eta: Number
 *      },
 *      ...
 *    ]
 *   }
 *   `list` is ordered the same way as the input `villagesCoords`
 */
export function createPoiTypeTask (osrm, poiGroup, villagesCoords) {
  return (callback) => {
    // Create a flat array with the coordinates of the poi, to be used
    // as destinations.
    let poiCoords = poiGroup.items.features.map(feat => ([feat.geometry.coordinates[0], feat.geometry.coordinates[1]]));
    // This should not happen :)
    if (poiCoords.length === 0) throw new Error('no destinations');

    // OSRM v5 requires one list of coordinates and two arrays of indices.
    let allCoords = villagesCoords.concat(poiCoords);
    // Indexes of {allCoords} that refer to villages
    let villagesIndexes = range(0, villagesCoords.length);
    // Indexes of {allCoords} that refer to poi
    let poiIndexes = range(villagesCoords.length, villagesCoords.length + poiCoords.length);

    let osrmOptions = {
      coordinates: allCoords,
      destinations: poiIndexes,
      sources: villagesIndexes
    };

    let results = [];
    osrm.table(osrmOptions, (err, res) => {
      if (err) {
        process.send({type: 'status', data: 'error'});
        // process.send({type: 'status', data: 'error', id: id});
        console.log('error', err);
        return callback(err);
      }

      // res.duration -> Table where each row represents a source (village)
      // and each column represents a destination (poi). Each cell displays
      // the time it takes from the source to the destination.

      // Validations
      if (res.durations && res.sources && res.destinations &&
      res.durations.length === res.sources.length &&
      res.durations[0].length === res.destinations.length) {
        results = res.durations.map(timeToPoi => ({ eta: Math.min(...timeToPoi) }));
      }

      return callback(null, {poi: poiGroup.type, list: results});
    });
  };
}
