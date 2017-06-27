import Hapi from 'hapi';
import jwksRsa from 'jwks-rsa';
import config from '../config';

module.exports = function (options, callback) {
  var server = {};

  server.options = options;

  server.hapi = new Hapi.Server({
    connections: {
      routes: {
        cors: true
      }
    },
    debug: config.debug && process.env.DS_ENV !== 'test' ? {
      log: [ 'error' ],
      request: [ 'error', 'received', 'response' ]
    } : false
  });

  server.hapi.connection(server.options.connection);

  server.hapi.register(require('hapi-auth-jwt2'), err => {
    if (err) callback(err);

    if (config.auth && config.auth.strategy === 'jwt') {
      server.hapi.auth.strategy('jwt', 'jwt', true, {
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

    // Bootstrap Hapi Server Plugins, passes the server object to the plugins.
    require('./plugins')(server.hapi, function (err) {
      if (err) throw err;
    });

    server.start = function (cb) {
      server.hapi.log(['info'], 'Database connected');
      server.hapi.start(function () {
        server.hapi.log(['info'], 'Server running at:' + server.hapi.info.uri);
        if (cb && typeof cb === 'function') {
          cb(null);
        }
      });
    };

    callback(null, server);
  });
};
