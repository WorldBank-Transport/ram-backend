'use strict';
import db from '../app/db/';
import { setupStructure as setupDb } from '../app/db/structure';
import { setupStructure as setupS3, bucketExists } from '../app/s3/structure';
import { bucket } from '../app/s3';
import { addData } from './fixtures/fixtures';

const arg = (a) => process.argv.indexOf(a) !== -1;

async function checkDangerousDbOp () {
  const exists = await db.schema.hasTable('scenarios');
  if (exists && !arg('--force-override')) {
    console.log('ERROR: Database is not empty.');
    console.log('Use --force-override if you want to delete everything.');
    process.exit(1);
  }
}

async function checkDangerousS3Op () {
  const exists = await bucketExists(bucket);
  if (exists && !arg('--force-override')) {
    console.log('ERROR: Bucket already exists.');
    console.log('Use --force-override if you want to delete everything.');
    process.exit(1);
  }
}

async function main (params) {
  try {
    if (arg('--help') || arg('-h') || (!arg('--data') && !arg('--db') && !arg('--bucket'))) {
      console.log('Options:');
      console.log('  --data', '     Sets up database and data fixtures.');
      console.log('  --db', '       Sets up database without data fixtures.');
      console.log('  --bucket', '   Sets up bucket for file storage.');
      console.log('');
      console.log('  --force-override', '   Use to override safe data check.');
      console.log('                      WARNING: All data will be lost');
      console.log('');
      process.exit(0);
    }

    if (arg('--data')) {
      await checkDangerousDbOp();
      await setupDb();
      await checkDangerousS3Op();
      await setupS3();
      await addData();
    } else {
      if (arg('--db')) {
        await checkDangerousDbOp();
        await setupDb();
      }

      if (arg('--bucket')) {
        await checkDangerousS3Op();
        await setupS3();
      }
    }

    console.log('done');
    process.exit(0);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}

main();
