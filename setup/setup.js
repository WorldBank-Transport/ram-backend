'use strict';
import { setupStructure as setupDb } from '../app/db/structure';
import { setupStructure as setupS3 } from '../app/s3/structure';
import { addData } from './fixtures/fixtures';

const arg = (a) => process.argv.indexOf(a) !== -1;
var fns = [];

if (arg('--data')) {
  fns.push(() => setupDb());
  fns.push(() => setupS3());
  fns.push(() => addData());
} else {
  if (arg('--db')) {
    fns.push(() => setupDb());
  }
  if (arg('--bucket')) {
    fns.push(() => setupS3());
  }
}

// No flags. Abort.
if (!fns.length) {
  console.log('Options:');
  console.log('  --data', '     Sets up database and data fixtures.');
  console.log('  --db', '       Sets up database without data fixtures.');
  console.log('  --bucket', '   Sets up bucket for file storage.');
  console.log('');
  console.log('WARNING: The commands are destructive. Data will be lost.');
  console.log('');
  process.exit(0);
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
