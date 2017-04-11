'use strict';
import path from 'path';
import obj2osm from 'obj2osm';
import getMap from 'osm-p2p-server/api/get_map';

import config from '../../config';
import { getDatabase } from '../rra-osm-p2p';
import db from '../../db/';
import { putFileStream } from '../../s3/utils';
import Operation from '../../utils/operation';
import AppLogger from '../../utils/app-logger';

const DEBUG = config.debug;
let appLogger = AppLogger({ output: DEBUG });
let logger;

process.on('message', function (e) {
  // Capture all the errors.
  try {
    logger = appLogger.group(`p${e.projId} s${e.scId} exp-rn`);
    logger.log('init');
    e.callback = (err) => {
      if (err) return process.exit(1);
      else process.exit(0);
    };
    exportRoadNetwork(e);
  } catch (err) {
    process.send({type: 'error', data: err.message, stack: err.stack});
    throw err;
  }
});

// The export road network script is setup so that it run on a different
// node process using fork. This allows us to offload the main server
// not causing blocking operations.

/**
 * Exports the road network from the osm-p2p-db and converts it to osm
 * format to be consumed by osrm. The resulting data is uploaded directly
 * to the s3 bucket.
 *
 * @param  {object} e       Data.
 *         e.opId           Operation Id. It has to be already started.
 *         e.projId         Project Id.
 *         e.scId           Scenario Id.
 *         e.callback
 */
export function exportRoadNetwork (e) {
  const {opId, projId, scId, callback} = e;

  let op = new Operation(db);
  op.loadById(opId)
    .then(op => op.log('road-network', {message: 'Updating road network'}))
    .then(op => {
      const bbox = [-180, -90, 180, 90];
      const toOsmOptions = {
        bounds: {minlon: bbox[0], minlat: bbox[1], maxlon: bbox[2], maxlat: bbox[3]}
      };
      const osmDb = getDatabase(projId, scId);
      const fileName = `road-network_${Date.now()}`;
      const filePath = `scenario-${scId}/${fileName}`;

      let formatTransform = obj2osm(toOsmOptions);

      formatTransform.on('error', (err) => {
        throw err;
      });

      logger && logger.log('starting data stream');
      let stream = getMap(osmDb)(bbox, {order: 'type'})
        .pipe(formatTransform);

      return putFileStream(filePath, stream);
    })
    .then(() => {
      logger && logger.log('process complete');
      DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../export-road-network_p${projId}s${scId}.log`));
      callback();
    })
    .catch(err => {
      logger && logger.log('error', err);
      DEBUG && appLogger && appLogger.toFile(path.resolve(__dirname, `../../../export-road-network_p${projId}s${scId}.log`));
      return op.log('error', {error: err.message})
        .then(op => op.finish())
        .then(() => callback(err.message), () => callback(err.message));
    });
}
