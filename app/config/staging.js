'use strict';
module.exports = {
  environment: 'staging',
  connection: {
    host: '0.0.0.0',
    port: 4000
  },
  db: 'postgresql://rra:rra@rra-postgis:5432/rra',
  dbTest: null,
  storage: {
    host: '34.207.194.24',
    port: 9000,
    engine: 'minio',
    accessKey: 'minio',
    secretKey: 'miniostorageengine',
    bucket: 'rra',
    region: 'us-east-1'
  }
};
