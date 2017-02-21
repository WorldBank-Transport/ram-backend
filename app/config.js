'use strict';
const _ = require('lodash');

// Prod settings act as base.
var config = require('./config/production');

// Staging overrides
if (process.env.DS_ENV === 'staging') {
  _.merge(config, require('./config/staging'));
}

// local config overrides everything when present.
try {
  var localConfig = require('./config/local');
  _.merge(config, localConfig);
} catch (e) {
  // Local file is not mandatory.
}

// Overrides by ENV variables:
config.debug = process.env.DEBUG || config.debug;
config.connection.port = process.env.PORT || config.connection.port;
config.connection.host = process.env.HOST || config.connection.host;

config.db = process.env.DB_CONNECTION || config.db;
config.dbTest = process.env.DB_TEST_CONNECTION || config.dbTest;

config.baseDir = __dirname;

module.exports = config;
