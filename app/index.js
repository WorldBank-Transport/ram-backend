'use strict';
require('dotenv').config();

import config from './config';
import initServer from './services/server';

var options = {
  connection: config.connection
};

// Start API server
initServer(options, (err, server) => {
  if (err) throw err;
  server.start(() => {
    // Started.
  });
});
