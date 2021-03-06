'use strict';
import fs from 'fs-extra';
import Promise from 'bluebird';

import S3, { bucket } from './';
import { removeObject, putObjectFromFile, listObjects, emptyBucket, putObject } from './structure';

const readFile = Promise.promisify(fs.readFile);

export async function getPresignedUrl (file) {
  const s3 = await S3();
  return new Promise((resolve, reject) => {
    s3.presignedPutObject(bucket, file, 24 * 60 * 60, (err, presignedUrl) => {
      if (err) {
        return reject(err);
      }
      return resolve(presignedUrl);
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
export async function getFile (file) {
  const s3 = await S3();
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
export async function fGetFile (file, dest) {
  const s3 = await S3();
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
export async function copyFile (oldFile, newFile) {
  const s3 = await S3();
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
export async function getFileInfo (file) {
  const s3 = await S3();
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
export async function copyDirectory (sourceDir, destDir) {
  const files = await listFiles(sourceDir);
  return Promise.map(files, file => {
    const newName = file.name.replace(sourceDir, destDir);
    return copyFile(file.name, newName);
  }, { concurrency: 10 });
}

// Get file content.
export async function getFileContents (file) {
  const s3 = await S3();
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
export async function getJSONFileContents (file) {
  const result = await getFileContents(file);
  return JSON.parse(result);
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
export async function putDirectory (sourceDir, destDir) {
  let files = await getLocalFilesInDir(sourceDir);
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

export async function getLocalFileContents (path) {
  const data = await readFile(path, 'utf8');

  // https://github.com/sindresorhus/strip-bom
  // Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
  // conversion translates it to FEFF (UTF-16 BOM)
  return data.charCodeAt(0) === 0xFEFF ? data.slice(1) : data;
}

export async function getLocalJSONFileContents (path) {
  const result = await getLocalFileContents(path);
  return JSON.parse(result);
}

export async function getLocalFilesInDir (dir) {
  const files = await fs.readdir(dir);

  return Promise.reduce(files, async (acc, file) => {
    const name = dir + '/' + file;
    const stats = await fs.stat(name);

    return stats.isDirectory()
      ? acc.concat(await getLocalFilesInDir(name))
      : acc.concat(name);
  }, []);
}

export function writeFileStreamPromise (stream, path) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(path);
    writeStream.on('error', err => reject(err));
    writeStream.on('finish', () => resolve(path));
    stream.pipe(writeStream);
  });
}
