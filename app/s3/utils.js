'use strict';
import s3, { bucket } from './';
import { removeObject } from './structure';

export function getPresignedUrl (file) {
  return new Promise((resolve, reject) => {
    s3.presignedPutObject(bucket, file, 24 * 60 * 60, (err, presignedUrl) => {
      if (err) {
        return reject(err);
      }
      return resolve(presignedUrl);
    });
  });
}

export function listenForFile (file) {
  return new Promise((resolve, reject) => {
    var listener = s3.listenBucketNotification(bucket, file, '', ['s3:ObjectCreated:*']);
    listener.on('notification', record => {
      listener.stop();
      return resolve(record);
    });
  });
}

// Proxy of removeObject function, assuming the bucket.
export function removeFile (file) {
  return removeObject(bucket, file);
}

// Get file.
export function getFile (file) {
  return new Promise((resolve, reject) => {
    s3.getObject(bucket, file, (err, dataStream) => {
      if (err) {
        return reject(err);
      }
      return resolve(dataStream);
    });
  });
}
