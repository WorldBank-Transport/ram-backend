// only ES5 is allowed in this file
require('babel-register')({
  presets: [ 'es2015' ]
});

// Perform check of env variables.
var missing = [
  'DB_URI',
  'PROJECT_ID',
  'SCENARIO_ID',
  'STORAGE_HOST',
  'STORAGE_PORT',
  'STORAGE_ENGINE',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_BUCKET',
  'STORAGE_REGION'
].filter(v => !process.env[v]);

if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// ^ END CHECKS

// load the server
require('./app/index.js');
