'use strict';
import jwksRsa from 'jwks-rsa';
import config from '../config';

module.exports = function (hapiServer, cb) {
  hapiServer.register(require('hapi-auth-jwt2'), err => {
    if (err) cb(err);

    if (config.auth && config.auth.strategy === 'jwt') {
      hapiServer.auth.strategy('jwt', 'jwt', true, {
        complete: true,
        key: jwksRsa.hapiJwt2Key({
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 5,
          jwksUri: `${config.auth.issuer}.well-known/jwks.json`
        }),
        verifyOptions: {
          audience: config.auth.audience,
          issuer: config.auth.issuer,
          algorithms: ['RS256']
        },
        validateFunc: (decoded, request, callback) => {
          if (decoded && decoded.sub) {
            return callback(null, true);
          }
          return callback(null, false);
        }
      });
    }
    hapiServer.register([
      // RRA OSM P2P Server
      {
        register: require('../plugins/rra-osm-p2p-server')
      },

      // Good console.
      {
        register: require('good'),
        options: {
          reporters: {
            console: [
              {
                module: 'good-squeeze',
                name: 'Squeeze',
                args: [{
                  response: '*',
                  log: '*'
                }]
              },
              {
                module: 'good-console'
              }, 'stdout']
          }
        }
      },

      // Route loader
      {
        register: require('hapi-router'),
        options: {
          routes: 'app/routes/*.js'
        }
      },

      // Pagination
      {
        register: require('../plugins/hapi-paginate'),
        options: {
          limit: 100,
          routes: [
            {route: '/projects', methods: 'GET'},
            {route: '/projects/{projId}/scenarios', methods: 'GET'},
            {route: '/projects/{projId}/scenarios/{scId}/results/raw', methods: 'GET'}
          ]
        }
      }
      // Plugin registration done.
    ], (err) => cb(err));
  });
};
