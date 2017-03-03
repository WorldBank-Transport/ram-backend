'use strict';
import * as Minio from 'minio';
import config from '../config';

var minioClient;
const { host, port, engine, accessKey, secretKey } = process.env.DS_ENV === 'test' ? config.storageTest : config.storage;

switch (engine) {
  case 'minio':
    minioClient = new Minio.Client({
      endPoint: host,
      port: port,
      secure: false,
      accessKey: accessKey,
      secretKey: secretKey
    });
    break;
  case 's3':
    throw new Error('Storage engine S3 not implemented');
  default:
    throw new Error('Invalid storage engine. Use s3 or minio');
}

export default minioClient;

export const bucket = process.env.DS_ENV === 'test' ? config.storageTest.bucket : config.storage.bucket;
export const region = process.env.DS_ENV === 'test' ? config.storageTest.region : config.storage.region;
