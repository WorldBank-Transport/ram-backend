/* global require, exports, module */
'use strict';

var _ = require('lodash');

exports.register = function (server, options, next) {
  var defaultPage = 1;
  var defaultLimit = options.limit || 100;
  var name = options.name || 'meta';
  var results = options.results || 'results';
  var routes = options.routes || ['*'];
  var excludeFormats = options.excludeFormats || [];
  var requestLimit = defaultLimit;
  var requestPage = defaultPage;

  server.ext('onPreHandler', function (request, reply) {
    if (_.has(request.query, 'page')) {
      requestPage = _.parseInt(request.query.page);
      request.query = _.omit(request.query, 'page');
    } else {
      requestPage = defaultPage;
    }

    if (_.has(request.query, 'limit')) {
      requestLimit = _.parseInt(request.query.limit);
      request.query = _.omit(request.query, 'limit');
    } else {
      requestLimit = defaultLimit;
    }

    request.page = requestPage;
    request.limit = requestLimit;

    return reply.continue();
  });

  server.ext('onPreResponse', function (request, reply) {
    var meta = {
      page: requestPage,
      limit: request.limit
    };

    if (_.has(request, 'count')) {
      meta.found = request.count;
    }

    // Make sure route matches and we're not exclude based on format
    const { path, method } = request.route;
    const whitelistRoute = routes[0] === '*' || !!routes.find(o => o.route === path && o.methods.indexOf(method.toUpperCase()) !== -1);
    if (whitelistRoute && excludeFormats.indexOf(request.query.format) === -1) {
      if (_.has(request.response.source, name)) {
        request.response.source[name] = _.merge(request.response.source[name], meta);
      } else {
        // Because we want to add meta to top of the source, we have to go through all this hastle
        var temp = request.response.source;
        request.response.source = {};
        request.response.source[name] = meta;
        request.response.source[results] = temp;
      }
    } else {
      // Remove any previous meta content since we don't want it in this case
      // if (_.has(request.response.source, name)) {
      //   delete request.response.source[name].page;
      //   delete request.response.source[name].limit;
      //   delete request.response.source[name].found;
      // }
    }

    return reply.continue();
  });

  next();
};

exports.register.attributes = {
  'name': 'hapi-paginate',
  'version': '0.4.0',
  'description': 'A pagination plugin for Hapi'
};
