'use strict';
import Promise from 'bluebird';

import S3, { bucket, region } from './';
import config from '../config';

const DEBUG = config.debug;
const BUCKET = bucket;
const REGION = region;

export function listObjects (bucket, objPrefix = '') {
  return new Promise(async (resolve, reject) => {
    var objects = [];
    const s3 = await S3();
    var stream = s3.listObjectsV2(bucket, objPrefix, true);
    stream.on('data', obj => {
      objects.push(obj);
    });
    stream.on('error', err => {
      return reject(err);
    });
    stream.on('end', () => {
      return resolve(objects);
    });
  });
}

export async function emptyBucket (bucket, objPrefix = '') {
  try {
    const objects = await listObjects(bucket, objPrefix);
    return Promise.map(objects, o => removeObject(bucket, o.name), { concurrency: 10 });
  } catch (err) {
    if (err.code === 'NoSuchBucket') {
      return [];
    }
    throw err;
  }
}

export function destroyBucket (bucket) {
  return emptyBucket(bucket)
    .then(() => removeBucket(bucket));
}

export function createBucket (bucket, region) {
  return new Promise(async (resolve, reject) => {
    const s3 = await S3();
    s3.makeBucket(bucket, region, err => {
      if (err) {
        if (err.code === 'BucketAlreadyOwnedByYou') {
          DEBUG && console.log(`Bucket ${bucket} already exists`);
        } else {
          return reject(err);
        }
      }
      DEBUG && console.log(`Bucket ${bucket} created`);
      return resolve({bucket, region});
    });
  });
}

export async function setupStructure () {
  await destroyBucket(BUCKET);
  return createBucket(BUCKET, REGION);
}

export function removeObject (bucket, name) {
  return new Promise(async (resolve, reject) => {
    const s3 = await S3();
    s3.removeObject(bucket, name, err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

function removeBucket (bucket) {
  return new Promise(async (resolve, reject) => {
    const s3 = await S3();
    s3.removeBucket(bucket, err => {
      if (err) {
        if (err.code === 'NoSuchBucket') {
          DEBUG && console.log(`Bucket ${bucket} does not exist. Skipping deletion`);
        } else {
          return reject(err);
        }
      }
      DEBUG && console.log(`Bucket ${bucket} deleted`);
      return resolve();
    });
  });
}

export function putObjectFromFile (bucket, name, filepath) {
  return new Promise(async (resolve, reject) => {
    const s3 = await S3();
    s3.fPutObject(bucket, name, filepath, 'application/octet-stream', (err, etag) => {
      if (err) {
        return reject(err);
      }
      return resolve(etag);
    });
  });
}

export function putObject (bucket, file, stream) {
  return new Promise(async (resolve, reject) => {
    const s3 = await S3();
    s3.putObject(bucket, file, stream, (err, etag) => {
      if (err) return reject(err);
      return resolve(etag);
    });
  });
}
