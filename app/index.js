'use strict';
require('dotenv').config();

import config from './config';
import initServer from './services/server';
import { getAWSInstanceCredentials } from './utils/aws';

var options = {
  connection: config.connection
};

async function main () {
  // If we're using a S3 storage engine but no accessKey and secretKey are set
  // up, we assume that it is being run from a EC2 instance and will try to
  // get the credentials through the url.
  const { engine, accessKey, secretKey } = config.storage;
  if (engine === 's3' && !accessKey && !secretKey) {
    console.log('AWS access key and secret not set. Will try to get them.');
    try {
      // Try to get the credentials on start just to see if everything is ok.
      await getAWSInstanceCredentials('', true);
      console.log('AWS credentials successfully fetched.');
    } catch (err) {
      console.log(err);
      console.log('Is this running on a EC2 instance?');
      process.exit(1);
    }
  }

  // Start API server
  initServer(options, (err, server) => {
    if (err) throw err;
    server.start(() => {
      // Started.
    });
  });
}

main();
