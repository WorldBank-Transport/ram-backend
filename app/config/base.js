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
    port: null,
    engine: 's3',
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
    container: 'wbtransport/ram-analysis:v0.1.0',
    db: null,
    storageHost: null,
    storagePort: null
  },
  vtProcess: {
    service: null,
    hyperAccess: null,
    hyperSecret: null,
    hyperSize: null,
    container: null,
    storageHost: null,
    storagePort: null
  },
  rahExport: {
    ghRepo: null,
    ghPath: null,
    ghToken: null,
    committerName: null,
    committerEmail: null,
    authorName: null,
    authorEmail: null
  },
  roadNetEditMax: 20 * Math.pow(1024, 2) // 20MB
};
