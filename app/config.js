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

config.storage.engine = process.env.STORAGE_ENGINE || config.storage.engine;
config.storage.accessKey = process.env.STORAGE_ACCESS_KEY || config.storage.accessKey;
config.storage.secretKey = process.env.STORAGE_SECRET_KEY || config.storage.secretKey;
config.storage.bucket = process.env.STORAGE_BUCKET || config.storage.bucket;
config.storage.region = process.env.STORAGE_REGION || config.storage.region;

config.baseDir = __dirname;

module.exports = config;
