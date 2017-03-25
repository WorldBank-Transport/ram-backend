'use strict';
import OSRM from 'osrm';
import async from 'async';
import intersect from '@turf/intersect';
import envelope from '@turf/envelope';
import squareGrid from '@turf/square-grid';

import config from '../config';
import { createProcessAreaTask } from './tasks';

process.env.UV_THREADPOOL_SIZE = config.cpus;

/**
 * Process to compute the time it takes for each village inside the
 * admin area to reach the closest of each poi type.
 *
 * @param  {Feature} adminArea Admin area to work with.
 * @param  {Object} poiByType  Object where each key represents a poi type and
 *                             the value is a FeatureCollection of points.
 * @param  {FeatureCollection} villages  Points representing villages
 * @param  {String} osrmFile   Location of the osrm file.
 * @param  {number} gridSize   Size of the grip in km (default to 30)
 * @param  {number} maxTime    Value in seconds.
 * @param  {number} maxSpeed   Value in km/h.
 * @param  {Number} id
 *
 * @return                     The process will emit several states:
 */
process.on('message', function (e) {
  process.send({type: 'status', data: 'srv_started', id: id});
  const {
    id,
    poi: poiByType,
    villages,
    osrmFile,
    adminArea,
    gridSize,
    maxTime,
    maxSpeed
  } = e;

  const osrm = new OSRM(osrmFile);
  process.send({type: 'status', data: 'srv_loaded_files', id: id});

  // Split the input region in squares for parallelisation.
  let box = envelope(adminArea);
  let extent = [box.geometry.coordinates[0][0][0], box.geometry.coordinates[0][0][1], box.geometry.coordinates[0][2][0], box.geometry.coordinates[0][2][1]];
  let squares = squareGrid(extent, gridSize || 30, 'kilometers').features;
  process.send({type: 'squarecount', data: squares.length, id: id});

  // Create a task for each square to be run below.
  var squareTasks = squares.map(square => {
    // Clip the square with the input geometry. In this way we work with a
    // smaller area..
    let workArea = intersect(adminArea, square);
    return createProcessAreaTask(workArea, poiByType, villages, osrm, maxTime, maxSpeed, id);
  });

  async.parallelLimit(squareTasks, config.cpus, (err, allSquaresRes) => {
    if (err) {
      throw err;
    }
    // allSquaresRes -> is an array of square results.
    // Flatten the array.
    let flat = allSquaresRes.reduce((acc, squareData) => acc.concat(squareData), []);
    process.send({type: 'done', data: flat, osrm: e.osrm, id: id});
  });
});
