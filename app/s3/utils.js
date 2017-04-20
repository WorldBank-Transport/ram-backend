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

// Copy file.
export function copyFile (oldFile, newFile) {
  return new Promise((resolve, reject) => {
    s3.copyObject(bucket, newFile, `${bucket}/${oldFile}`, null, (err, data) => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}

// Get file content.
export function getFileContents (file) {
  return new Promise((resolve, reject) => {
    s3.getObject(bucket, file, (err, dataStream) => {
      if (err) return reject(err);

      var data = '';
      dataStream.on('data', chunk => (data += chunk));
      dataStream.on('end', () => resolve(data));
      dataStream.on('error', () => reject(err));
    });
  });
}

// Get file content in JSON.
export function getJSONFileContents (file) {
  return getFileContents(file)
    .then(result => JSON.parse(result));
}

// Put file from stream
export function putFileStream (file, stream) {
  return new Promise((resolve, reject) => {
    s3.putObject(bucket, file, stream, (err, etag) => {
      if (err) return reject(err);
      return resolve(etag);
    });
  });
}
