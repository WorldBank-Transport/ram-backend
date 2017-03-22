// only ES5 is allowed in this file
require('babel-register')({
  presets: [ 'es2015' ]
});

// load the server
require('./calculate-eta/');

//
// Check the README.md in the calculate-eta directory for more information.
//
