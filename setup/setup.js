'use strict';
import { setupStructure as setupDb } from '../app/db/structure';
import { setupStructure as setupS3 } from '../app/s3/structure';
import { addData } from './fixtures/fixtures';

const arg = (a) => process.argv.indexOf(a) !== -1;
var fns = [];

if (arg('--data')) {
  fns.push(() => setupDb());
  fns.push(() => addData());
} else if (arg('--db')) {
  fns.push(() => setupDb());
}

if (arg('--s3')) {
  fns.push(() => setupS3());
}

// No specifics. Do not setup data.
if (!fns.length) {
  fns.push(() => setupDb());
  fns.push(() => setupS3());
}

PromiseSerial(fns)
.then(res => {
  console.log('done');
  process.exit(0);
})
.catch(err => {
  console.log(err);
  process.exit(1);
});

function PromiseSerial (promisesFn) {
  var result = Promise.resolve();
  promisesFn.forEach(fn => {
    result = result.then(fn);
  });
  return result;
}
