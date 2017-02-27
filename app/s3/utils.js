'use strict';
import s3 from './';
import { removeObject } from './structure';
import config from '../config';

export function getPresignedUrl (file) {
  return new Promise((resolve, reject) => {
    s3.presignedPutObject(config.storage.bucket, file, 24 * 60 * 60, (err, presignedUrl) => {
      if (err) {
        return reject(err);
      }
      return resolve(presignedUrl);
    });
  });
}

export function listenForFile (file) {
  return new Promise((resolve, reject) => {
    var listener = s3.listenBucketNotification(config.storage.bucket, file, '', ['s3:ObjectCreated:*']);
    listener.on('notification', record => {
      listener.stop();
      return resolve(record);
    });
  });
}

// Proxy of removeObject function, assuming the bucket.
export function removeFile (file) {
  return removeObject(config.storage.bucket, file);
}
