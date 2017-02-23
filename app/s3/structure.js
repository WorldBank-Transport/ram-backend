'use strict';
import s3 from './';

export function setupStructure () {
  return new Promise((resolve, reject) => {
    let bucket = 'rra';
    let region = 'us-east-1';

    s3.makeBucket(bucket, region, err => {
      if (err) {
        if (err.code === 'BucketAlreadyOwnedByYou') {
          console.log('Bucket already exists');
        } else {
          return reject(err);
        }
      }
      return resolve({bucket, region});
    });
  });
}
