'use strict';
require('dotenv').config();
import fetch from 'node-fetch';

import config from './config';
import initServer from './services/server';

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
      const awsIAMUrl = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/';
      const roleRes = await fetch(awsIAMUrl);
      if (roleRes.status >= 400) throw new Error('Unable to fetch role name');

      const roleName = await roleRes.text();
      const accessRes = await fetch(`${awsIAMUrl}${roleName}`);
      if (accessRes.status >= 400) throw new Error('Unable to fetch access credentials');
      const accessCredentials = await accessRes.json();

      // Updating config and set the credentials.
      config.storage.accessKey = accessCredentials.AccessKeyId;
      config.storage.secretKey = accessCredentials.SecretAccessKey;
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
