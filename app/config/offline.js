module.exports = {
  environment: 'offline',
  debug: false,
  connection: {
    host: '0.0.0.0',
    port: 4000
  },
  auth: {
    strategy: 'none'
  },
  db: 'postgresql://rra:rra@172.99.99.10:5432/rra',
  osmP2PDir: `${__dirname}/../../osm-p2p-dbs`,
  storage: {
    host: '172.99.99.15',
    port: 9000,
    engine: 'minio',
    accessKey: 'minio',
    secretKey: 'miniostorageengine',
    bucket: 'rra',
    region: 'us-east-1'
  },
  analysisProcess: {
    service: 'docker',
    container: 'wbtransport/rra-analysis:latest-stable',
    db: 'postgresql://rra:rra@172.99.99.10:5432/rra',
    storageHost: '172.99.99.15',
    storagePort: 9000
  },
  vtProcess: {
    service: 'docker',
    container: 'wbtransport/rra-vt:latest-stable',
    storageHost: '172.99.99.15',
    storagePort: 9000
  },
  roadNetEditThreshold: 20 * Math.pow(1024, 2) // 20MB
};
