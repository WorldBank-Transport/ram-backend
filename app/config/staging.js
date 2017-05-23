'use strict';
module.exports = {
  environment: 'staging',
  connection: {
    host: '0.0.0.0',
    port: 4000
  },
  db: 'postgresql://rra:rra@rra-postgis:5432/rra',
  osmP2PDir: `${__dirname}/../../osm-p2p-dbs`,
  storage: {
    host: null,
    port: null,
    engine: 's3',
    accessKey: 'AKIAIPEH472XR6VB5U3A',
    secretKey: null,
    bucket: 'rra-staging-storage',
    region: 'us-east-1'
  },
  analysisProcess: {
    service: 'hyper',
    hyperAccess: null,
    hyperSecret: null,
    container: 'wbtransport/rra-analysis:latest-dev',
    db: null,
    storageHost: '34.207.194.24',
    storagePort: 9000
  }
};
