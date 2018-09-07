module.exports = {
  environment: 'offline',
  debug: false,
  instanceId: 'offline-ram',
  connection: {
    host: '0.0.0.0',
    port: 4000
  },
  auth: {
    strategy: 'none'
  },
  db: 'postgresql://ram:ram@172.99.99.10:5432/ram',
  osmP2PDir: `${__dirname}/../../osm-p2p-dbs`,
  storage: {
    host: '172.99.99.15',
    port: 9000,
    engine: 'minio',
    accessKey: 'minio',
    secretKey: 'miniostorageengine',
    bucket: 'ram',
    region: 'us-east-1'
  },
  analysisProcess: {
    service: 'docker',
    container: 'wbtransport/ram-analysis:v0.1.0',
    db: 'postgresql://ram:ram@172.99.99.10:5432/ram',
    storageHost: '172.99.99.15',
    storagePort: 9000
  },
  vtProcess: {
    service: 'docker',
    container: 'wbtransport/ram-vt:v0.1.0',
    storageHost: '172.99.99.15',
    storagePort: 9000
  },
  roadNetEditMax: 20 * Math.pow(1024, 2) // 20MB
};
