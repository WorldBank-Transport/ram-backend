'use strict';
import * as Minio from 'minio';
import Http from 'http';
import Https from 'https';

import config from '../config';

var minioClient;
var agent;
const { host, port, engine, accessKey, secretKey } = config.storage;

switch (engine) {
  case 'minio':
    minioClient = new Minio.Client({
      endPoint: host,
      port: port,
      secure: false,
      accessKey: accessKey,
      secretKey: secretKey
    });
    agent = Http.globalAgent;
    break;
  case 's3':
    minioClient = new Minio.Client({
      endPoint: 's3.amazonaws.com',
      accessKey: config.storage.accessKey,
      secretKey: config.storage.secretKey
    });
    agent = Https.globalAgent;
    break;
  default:
    throw new Error('Invalid storage engine. Use s3 or minio');
}

// Temp fix for https://github.com/minio/minio-js/issues/641
minioClient.agent = agent;

export default minioClient;

export const bucket = config.storage.bucket;
export const region = config.storage.region;
