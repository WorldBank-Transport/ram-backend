'use strict';
import * as Minio from 'minio';
import Http from 'http';
import Https from 'https';

import config from '../config';
import { getAWSInstanceCredentials } from '../utils/aws';

const { host, port, engine, accessKey, secretKey } = config.storage;

export const bucket = config.storage.bucket;
export const region = config.storage.region;

/**
 * Initializes the minio s3 client depending on the engine and credentials
 * source in use. Needs to be a promise because it may rely on asynchronously
 * fetched credentials.
 *
 * @returns Minio Client
 */
export default async function S3 () {
  let minioClient;
  let agent;

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
      let credentials;
      if (!accessKey && !secretKey) {
        // If we're using a S3 storage engine but no accessKey and secretKey
        // are set up, we assume that it is being run from a EC2 instance and
        // will try to get the credentials through the url. We're not throwing
        // any error if it fails because that is checked on startup.
        // See app/index.js
        const AWSInstanceCredentials = await getAWSInstanceCredentials();
        credentials = {
          accessKey: AWSInstanceCredentials.accessKey,
          secretKey: AWSInstanceCredentials.secretKey,
          token: AWSInstanceCredentials.token
        };
      } else {
        credentials = { accessKey, secretKey };
      }

      minioClient = new Minio.Client({
        endPoint: 's3.amazonaws.com',
        ...credentials
      });
      agent = Https.globalAgent;
      break;
    default:
      throw new Error('Invalid storage engine. Use s3 or minio');
  }

  // Temp fix for https://github.com/minio/minio-js/issues/641
  minioClient.agent = agent;

  return minioClient;
}
