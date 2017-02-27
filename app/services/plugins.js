'use strict';

module.exports = function (hapiServer, cb) {
  hapiServer.register([
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
          {route: '/projects/{projId}/scenarios', methods: 'GET'}
        ]
      }
    }
    // Plugin registration done.
  ], (err) => cb(err));
};
