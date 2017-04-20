// only ES5 is allowed in this file
require('babel-register')({
  presets: [ 'es2015' ]
});

// load the server
require('./project-setup');

//
// The project setup script is setup so that it run on a different node process
// using fork. This allows us to offload the main server not causing blocking
// operations.
//
