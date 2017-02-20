import Hapi from 'hapi';
import config from '../config';

module.exports = function (options) {
  var server = {};

  server.options = options;

  server.hapi = new Hapi.Server({
    connections: {
      routes: {
        cors: true
      }
    },
    debug: config.debug ? {
      log: [ 'error' ],
      request: [ 'error', 'received', 'response' ]
    } : false
  });

  server.hapi.connection(server.options.connection);

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

  return server;
};
