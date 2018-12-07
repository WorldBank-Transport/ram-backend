'use strict';
const _ = require('lodash');

// Empty template as base.
var config = require('./config/base');

// local config overrides when present.
try {
  _.merge(config, require('./config/local'));
} catch (e) {
  // Local file is not mandatory.
}

// In an offline setup, the other config files are ignored
if (process.env.DS_ENV === 'offline') {
  config = require('./config/offline');
}

// Check if an instance id was defined.
config.instanceId = process.env.INSTANCE_ID || config.instanceId;

if (!config.instanceId) throw new Error('The RAM instance id was not defined. Set one with INSTANCE_ID');

if (!config.instanceId.match(/^[a-z0-9-_.]+$/)) throw new Error('Instance id invalid. Use only lowercase alphanumeric characters and _ - .');

// Overrides by ENV variables.
config.db = process.env.DB_URI || config.db;

config.debug = process.env.DEBUG !== undefined ? (process.env.DEBUG.toLowerCase() === 'true') : config.debug;
config.connection.port = process.env.PORT || config.connection.port;
config.connection.host = process.env.HOST || config.connection.host;

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
config.analysisProcess.hyperSize = process.env.HYPER_SIZE || config.analysisProcess.hyperSize;

config.vtProcess.service = process.env.VT_SERVICE || config.vtProcess.service;
config.vtProcess.container = process.env.VT_CONTAINER || config.vtProcess.container;
config.vtProcess.storageHost = process.env.VT_STORAGE_HOST || config.vtProcess.storageHost;
config.vtProcess.storagePort = process.env.VT_STORAGE_PORT || config.vtProcess.storagePort;
config.vtProcess.hyperAccess = process.env.HYPER_ACCESS || config.vtProcess.hyperAccess;
config.vtProcess.hyperSecret = process.env.HYPER_SECRET || config.vtProcess.hyperSecret;
config.vtProcess.hyperSize = process.env.HYPER_SIZE || config.vtProcess.hyperSize;

config.rahExport.ghRepo = process.env.RAH_GH_REPO || config.rahExport.ghRepo;
config.rahExport.ghToken = process.env.RAH_GH_TOKEN || config.rahExport.ghToken;
config.rahExport.ghPath = process.env.RAH_GH_PATH || config.rahExport.ghPath;
config.rahExport.committerName = process.env.RAH_CNAME || config.rahExport.committerName;
config.rahExport.committerEmail = process.env.RAH_CEMAIL || config.rahExport.committerEmail;
config.rahExport.authorName = process.env.RAH_ANAME || config.rahExport.authorName;
config.rahExport.authorEmail = process.env.RAH_AEMAIL || config.rahExport.authorEmail;

config.roadNetEditMax = process.env.ROAD_NET_EDIT_MAX || config.roadNetEditMax;

config.baseDir = __dirname;

module.exports = config;
