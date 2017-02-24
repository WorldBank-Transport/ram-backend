'use strict';
import s3 from './';

const BUCKET = 'rra';
const REGION = 'us-east-1';

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
          console.log(`Bucket ${bucket} already exists`);
        } else {
          return reject(err);
        }
      }
      console.log(`Bucket ${bucket} created`);
      return resolve({bucket, region});
    });
  });
}

export function setupStructure () {
  return destroyBucket(BUCKET)
    .then(() => createBucket(BUCKET, REGION));
}

function removeObject (bucket, key) {
  return new Promise((resolve, reject) => {
    s3.removeObject(bucket, key, err => {
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
          console.log(`Bucket ${bucket} does not exist. Skipping deletion`);
        } else {
          return reject(err);
        }
      }
      console.log(`Bucket ${bucket} deleted`);
      return resolve();
    });
  });
}
