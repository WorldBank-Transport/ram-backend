'use strict';
import fs from 'fs-extra';
import path from 'path';
import Promise from 'bluebird';
const copy = Promise.promisify(fs.copy);
const remove = Promise.promisify(fs.remove);

import { setupStructure as setupDb } from '../app/db/structure';
import { setupStructure as setupS3 } from '../app/s3/structure';
import { addData } from './fixtures/fixtures';
import config from '../app/config';

const rmOsmP2PDbs = () => {
  console.log('Removing osm-p2p dbs:', config.osmP2PDir);
  return remove(config.osmP2PDir);
};

const addOsmP2PData = () => {
  console.log('Adding osm-p2p dbs:', config.osmP2PDir);
  const src = path.resolve(__dirname, '../test/utils/data-sergipe/osm-p2p-db');
  const copyOsmP2PDb = (pId, scId) => copy(src, path.resolve(config.osmP2PDir, `p${pId}s${scId}`));

  return Promise.all([
    copyOsmP2PDb(1100, 1100),
    copyOsmP2PDb(1200, 1200),
    copyOsmP2PDb(1200, 1201),
    copyOsmP2PDb(2000, 2000)
  ]);
};

const arg = (a) => process.argv.indexOf(a) !== -1;
var fns = [];

if (arg('--data')) {
  fns.push(() => rmOsmP2PDbs());
  fns.push(() => setupDb());
  fns.push(() => setupS3());
  fns.push(() => addData());
  fns.push(() => addOsmP2PData());
} else {
  if (arg('--db')) {
    fns.push(() => rmOsmP2PDbs());
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
