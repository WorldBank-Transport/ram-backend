'use strict';
module.exports = {
  environment: 'production',
  connection: {
    host: '0.0.0.0',
    port: 4000
  },
  db: null,
  dbTest: null,
  storage: {
    host: null,
    port: 9000,
    engine: null,
    accessKey: null,
    secretKey: null,
    bucket: null,
    region: null
  },
  storageTest: {
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
    container: null,
    db: null,
    storageHost: null,
    storagePort: 9000
  }
};
