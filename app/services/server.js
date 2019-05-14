import Hapi from 'hapi';
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
      request: [ 'error' ]
    } : false
  });

  server.hapi.connection(server.options.connection);

  // Bootstrap Hapi Server Plugins, passes the server object to the plugins.
  require('./plugins')(server.hapi, function (err) {
    if (err) callback(err);

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
