'use strict';
import s3, { bucket } from './';

// Proxy of removeObject function, assuming the bucket.
export function removeFile (file) {
  return new Promise((resolve, reject) => {
    s3.removeObject(bucket, file, err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
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
    .then(result => {
      try {
        return JSON.parse(result);
      } catch (e) {
        Promise.reject(e);
      }
    });
}

// Get file and write to disk.
export function writeFile (file, destination) {
  return new Promise((resolve, reject) => {
    s3.fGetObject(bucket, file, destination, err => {
      if (err) {
        return reject(err);
      }
      return resolve();
    });
  });
}
