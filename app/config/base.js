'use strict';
module.exports = {
  connection: {
    host: '0.0.0.0',
    port: 4000
  },
  db: null,
  osmP2PDir: null,
  storage: {
    host: null,
    port: 9000,
    engine: null,
    accessKey: null,
    secretKey: null,
    bucket: null,
    region: null
  },
  analysisProcess: {
    service: null,
    hyperAccess: null,
    hyperSecret: null,
    hyperSize: null,
    container: 'wbtransport/rra-analysis:latest-stable',
    db: null,
    storageHost: null,
    storagePort: 9000
  },
  roadNetEditThreshold: 20 * Math.pow(1024, 2) // 20MB
};
