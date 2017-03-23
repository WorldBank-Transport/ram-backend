'use strict';
import OSRM from 'osrm';
import async from 'async';
import os from 'os';
import { intersect } from '@turf/turf';

import { createProcessAreaTask } from './tasks';

const cpus = os.cpus().length;
process.env.UV_THREADPOOL_SIZE = Math.floor(cpus * 1.5);

process.on('message', function (e) {
  process.send({type: 'status', data: 'srv_started', id: id});
  const {
    id,
    poi: poiByType,
    squares,
    villages,
    osrmFile,
    adminArea,
    maxTime,
    maxSpeed
  } = e;

  var osrm = new OSRM(osrmFile);
  process.send({type: 'status', data: 'srv_loaded_files', id: id});

  // Create a task for each square to be run below.
  var squareTasks = squares.map(square => {
    // Clip the square with the input geometry. In this way we work with a
    // smaller area and allow parallelisation.
    let workArea = intersect(adminArea, square);
    return createProcessAreaTask(workArea, poiByType, villages, osrm, maxTime, maxSpeed, id);
  });

  async.parallelLimit(squareTasks, cpus, (err, allSquaresRes) => {
    if (err) {
      throw err;
    }
    // allSquaresRes -> is an array of square results.
    // Flatten the array.
    let flat = allSquaresRes.reduce((acc, squareData) => acc.concat(squareData), []);
    process.send({type: 'done', data: flat, osrm: e.osrm, id: id});
  });
});
