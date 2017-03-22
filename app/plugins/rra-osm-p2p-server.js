'use strict';
import Joi from 'joi';
import config from '../config';
import osmdb from 'osm-p2p';
import osmrouter from 'osm-p2p-server';

var dbConnections = {};

const rraOsmRoute = {
  path: '/projects/{projId}/scenarios/{scId}/osm/{path*}',
  method: '*',
  config: {
    validate: {
      params: {
        projId: Joi.number(),
        scId: Joi.number(),
        path: Joi.string()
      }
    },
    // Ensure that the payload is still a stream so the osm-p2p-server
    // can handle.
    payload: {
      output: 'stream',
      maxBytes: 1000 * 1024 * 1024
    }
  },
  handler: (request, reply) => {
    const { projId, scId, path } = request.params;
    const router = getRouter(projId, scId);

    let req = request.raw.req;
    let res = request.raw.res;

    let qs = req.url.match(/\?(.*)+/);
    qs = qs ? qs[0] : '';

    req.url = `/api/0.6/${path}${qs}`;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    if (!router.handle(req, res)) {
      return reply('no');
    } else {
    }
  }
};

function getRouter (projId, scId) {
  return osmrouter(getDatabase(projId, scId));
}

function getDatabase (projId, scId) {
  let baseDir = `${config.baseDir}/../osm-p2p-dbs`;
  let dbName = `p${projId}s${scId}`;

  // Create a connection if one is not found.
  if (!dbConnections[dbName]) {
    dbConnections[dbName] = osmdb(`${baseDir}/${dbName}`);
  }

  return dbConnections[dbName];
}

exports.register = function (server, options, next) {
  server.route(rraOsmRoute);
  next();
};

exports.register.attributes = {
  'name': 'rra-osm-p2p-server',
  'version': '0.1.0',
  'description': 'RRA connection to osm-p2p-server'
};
