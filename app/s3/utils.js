'use strict';
import fs from 'fs-extra';
import Promise from 'bluebird';

import s3, { bucket } from './';
import { removeObject, putObjectFromFile, listObjects, emptyBucket, putObject } from './structure';

const readFile = Promise.promisify(fs.readFile);

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

// Proxy of emptyBucket function, assuming the bucket.
export function removeDir (dir) {
  return emptyBucket(bucket, dir);
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

// Get s3 file to file.
export function fGetFile (file, dest) {
  return new Promise((resolve, reject) => {
    s3.fGetObject(bucket, file, dest, (err) => {
      if (err) {
        return reject(err);
      }
      return resolve(dest);
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

// File stats.
export function getFileInfo (file) {
  return new Promise((resolve, reject) => {
    s3.statObject(bucket, file, (err, stat) => {
      if (err) {
        return reject(err);
      }
      return resolve(stat);
    });
  });
}

// Copy directory.
export function copyDirectory (sourceDir, destDir) {
  return listFiles(sourceDir)
    .then(files => Promise.map(files, file => {
      let newName = file.name.replace(sourceDir, destDir);
      return copyFile(file.name, newName);
    }, { concurrency: 10 }));
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

// Put object
// Proxy of putObject function, assuming the bucket.
export function putFileStream (file, stream) {
  return putObject(bucket, file, stream);
}

// Put file
// Proxy of putObjectFromFile function, assuming the bucket.
export function putFile (name, filepath) {
  return putObjectFromFile(bucket, name, filepath);
}

// List files
// Proxy of listObjects function, assuming the bucket.
export function listFiles (namePrefix) {
  return listObjects(bucket, namePrefix);
}

// Put directory
export function putDirectory (sourceDir, destDir) {
  let files = getLocalFilesInDir(sourceDir);
  return Promise.map(files, file => {
    let newName = file.replace(sourceDir, destDir);
    return putFile(newName, file);
  }, { concurrency: 10 });
}

// Local file operation.

export function removeLocalFile (path, quiet = false) {
  return new Promise((resolve, reject) => {
    fs.unlink(path, err => {
      if (err && !quiet) {
        return reject(err);
      }
      return resolve();
    });
  });
}

export function getLocalFileContents (path) {
  return readFile(path, 'utf8')
    .then(data => {
      // https://github.com/sindresorhus/strip-bom
      // Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
      // conversion translates it to FEFF (UTF-16 BOM)
      if (data.charCodeAt(0) === 0xFEFF) {
        return data.slice(1);
      }
      return data;
    });
}

export function getLocalJSONFileContents (path) {
  return getLocalFileContents(path)
    .then(result => JSON.parse(result));
}

export function getLocalFilesInDir (dir) {
  const files = fs.readdirSync(dir);

  return files.reduce((acc, file) => {
    let name = dir + '/' + file;
    if (fs.statSync(name).isDirectory()) {
      acc = acc.concat(getLocalFilesInDir(name));
    } else {
      acc.push(name);
    }

    return acc;
  }, []);
}
