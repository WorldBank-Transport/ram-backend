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

// In a test setup, the other config files are ignored
if (process.env.DS_ENV === 'test') {
  config = require('./config/test');
}

// In an offline test setup, the other config files are ignored
if (process.env.DS_ENV === 'offline') {
  config = require('./config/offline');
}

// Overrides by ENV variables:
config.debug = process.env.DEBUG !== undefined ? (process.env.DEBUG.toLowerCase() === 'true') : config.debug;
config.connection.port = process.env.PORT || config.connection.port;
config.connection.host = process.env.HOST || config.connection.host;

config.db = process.env.DB_CONNECTION || config.db;

config.osmP2PDir = process.env.OSM_P2P_DIR || config.osmP2PDir;

config.storage.host = process.env.STORAGE_HOST || config.storage.host;
config.storage.port = parseInt(process.env.STORAGE_PORT) || config.storage.port;
config.storage.engine = process.env.STORAGE_ENGINE || config.storage.engine;
config.storage.accessKey = process.env.STORAGE_ACCESS_KEY || config.storage.accessKey;
config.storage.secretKey = process.env.STORAGE_SECRET_KEY || config.storage.secretKey;
config.storage.bucket = process.env.STORAGE_BUCKET || config.storage.bucket;
config.storage.region = process.env.STORAGE_REGION || config.storage.region;

config.analysisProcess.service = process.env.ANL_SERVICE || config.analysisProcess.service;
config.analysisProcess.container = process.env.ANL_CONTAINER || config.analysisProcess.container;
config.analysisProcess.db = process.env.ANL_DB || config.analysisProcess.db;
config.analysisProcess.storageHost = process.env.ANL_STORAGE_HOST || config.analysisProcess.storageHost;
config.analysisProcess.storagePort = process.env.ANL_STORAGE_PORT || config.analysisProcess.storagePort;
config.analysisProcess.hyperAccess = process.env.HYPER_ACCESS || config.analysisProcess.hyperAccess;
config.analysisProcess.hyperSecret = process.env.HYPER_SECRET || config.analysisProcess.hyperSecret;

config.baseDir = __dirname;

module.exports = config;
