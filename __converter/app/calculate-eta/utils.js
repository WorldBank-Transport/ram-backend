'use strict';
import { featureCollection } from '@turf/helpers';
import within from '@turf/within';
import buffer from '@turf/buffer';
/**
 * Create an array filled with a range of numbers starting at {start} and ending
 * at {end - 1}
 * @param  {Number} start
 * @param  {Number} end
 * @return {Array}
 *   Array with range [0, 1, 2 ...]
 */
export function range (start, end) {
  let res = [];
  for (var i = start; i < end; i++) { res.push(i); }
  return res;
}

/**
 * Get all villages in the given area.
 * @param  {Feature} area
 * @param  {FeatureCollection} villages
 * @return {FeatureCollection}
 *   Villages in the given area
 */
export function villagesInRegion (area, villages) {
  let result = within(villages, featureCollection([area]));
  return result;
}

/**
 * Get the poi within a buffer around area.
 * The buffer distance is calculated based of the kilometers traveled at {speed}
 * during {time} seconds.
 * @param  {Feature} area
 * @param  {number} time    Value in seconds
 * @param  {number} speed   Value in km/h
 * @param  {FeatureCollection} poi     Points of Interest
 * @return {FeatureCollection}
 *   The Points of Interest in the buffered area.
 */
export function poisInBuffer (area, poi, time, speed) {
  let distance = (time / 3600) * speed;
  let bufferedArea = buffer(area, distance, 'kilometers');
  var result = within(poi, featureCollection([bufferedArea]));
  return result;
}
