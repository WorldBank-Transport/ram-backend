'use strict';
import Promise from 'bluebird';

import S3, { bucket, region } from './';
import config from '../config';

const DEBUG = config.debug;
const BUCKET = bucket;
const REGION = region;

export async function listObjects (bucket, objPrefix = '') {
  const s3 = await S3();
  return new Promise((resolve, reject) => {
    var objects = [];
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

export async function bucketExists (bucket) {
  const s3 = await S3();
  return new Promise((resolve, reject) => {
    s3.bucketExists(bucket, err => {
      if (err) {
        return err.code === 'NoSuchBucket' || err.code === 'NotFound'
          ? resolve(false)
          : reject(err);
      }
      return resolve(true);
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

export async function createBucket (bucket, region) {
  const s3 = await S3();
  return new Promise((resolve, reject) => {
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

export async function removeObject (bucket, name) {
  const s3 = await S3();
  return new Promise((resolve, reject) => {
    s3.removeObject(bucket, name, err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

async function removeBucket (bucket) {
  const s3 = await S3();
  return new Promise((resolve, reject) => {
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

export async function putObjectFromFile (bucket, name, filepath) {
  const s3 = await S3();
  return new Promise((resolve, reject) => {
    s3.fPutObject(bucket, name, filepath, 'application/octet-stream', (err, etag) => {
      if (err) {
        return reject(err);
      }
      return resolve(etag);
    });
  });
}

export async function putObject (bucket, file, stream) {
  const s3 = await S3();
  return new Promise((resolve, reject) => {
    s3.putObject(bucket, file, stream, (err, etag) => {
      if (err) return reject(err);
      return resolve(etag);
    });
  });
}
