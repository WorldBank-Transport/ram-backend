'use strict';
import { setupStructure as setupDb } from '../app/db/structure';
import { setupStructure as setupS3 } from '../app/s3/structure';
import { addData } from './fixtures/fixtures';

var setup = setupDb()
  .then(() => setupS3());

if (process.argv.indexOf('--data') !== -1) {
  setup = setup.then(() => addData());
}

setup
.then(res => {
  console.log('done');
  process.exit(0);
})
.catch(err => {
  console.log(err);
  process.exit(1);
});
