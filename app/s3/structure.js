'use strict';
import s3 from './';
import config from '../config';

const DEBUG = config;
const BUCKET = config.storage.bucket;
const REGION = config.storage.region;

export function emptyBucket (bucket) {
  return new Promise((resolve, reject) => {
    var remove = [];
    var stream = s3.listObjectsV2(bucket, '', true);
    stream.on('data', obj => {
      remove.push(removeObject(bucket, obj.name));
    });
    stream.on('error', err => {
      if (err.code === 'NoSuchBucket') {
        return resolve();
      }
      return reject(err);
    });
    stream.on('end', () => {
      Promise.all(remove)
        .then(() => resolve())
        .catch(err => reject(err));
    });
  });
}

export function destroyBucket (bucket) {
  return emptyBucket(bucket)
    .then(() => removeBucket(bucket));
}

export function createBucket (bucket, region) {
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

export function setupStructure () {
  return destroyBucket(BUCKET)
    .then(() => createBucket(BUCKET, REGION));
}

export function removeObject (bucket, name) {
  return new Promise((resolve, reject) => {
    s3.removeObject(bucket, name, err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

function removeBucket (bucket) {
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
