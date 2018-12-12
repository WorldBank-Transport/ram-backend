'use strict';
import fetch from 'node-fetch';

/**
 * NOTE: This file is duplicated on some services. Be sure to update all of them
 * - ram-analysis
 * - ram-vt
 * - ram-backend
 */

/**
 * Cache for the credentials.
 */
let AWSInstanceCredentialsCache = {
  accessKey: null,
  secretKey: null,
  sessionToken: null,
  expireTime: null
};

/**
 * Fetches the instance credentials for a given role name.
 * The instance needs to belong to the given role.
 *
 * @param {string} roleName The role name to use when fetching the credentials
 *
 * @throws Error if any of the requests fail.
 */
export async function fetchAWSInstanceCredentials (roleName) {
  // When inside a container in a ec2 instance (or when using fargate), the ecs
  // client adds a varible with the credentials url. If is is available use that.
  // Docs at: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html
  const relUrl = process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI;
  let accessCredUrl = '';
  if (relUrl) {
    accessCredUrl = `http://169.254.170.2${relUrl}`;
  } else {
    // If we're inside an ec2 machine just use the regular url and fetch the
    // role if it was not provided.
    const awsIAMUrl = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/';
    if (!roleName) {
      const roleRes = await fetch(awsIAMUrl, { timeout: 2000 });
      if (roleRes.status >= 400) throw new Error('Unable to fetch role name');
      roleName = await roleRes.text();
    }
    accessCredUrl = `${awsIAMUrl}${roleName}`;
  }

  const accessRes = await fetch(accessCredUrl, { timeout: 2000 });
  if (accessRes.status >= 400) throw new Error('Unable to fetch access credentials');
  const accessCredentials = await accessRes.json();

  return {
    accessKey: accessCredentials.AccessKeyId,
    secretKey: accessCredentials.SecretAccessKey,
    sessionToken: accessCredentials.Token,
    // Set the expiration back 30min to give some margin.
    expireTime: (new Date(accessCredentials.Expiration)).getTime() - 1800 * 1000
  };
}

/**
 * Gets the credentials from cache unless they are expired.
 *
 * @see fetchAWSInstanceCredentials()
 *
 * @param {string} roleName The role name to use when fetching the credentials.
 * @param {bool} force Force fetching new credentials. Defaults to false.
 */
export async function getAWSInstanceCredentials (roleName, force = false) {
  if (force) return fetchAWSInstanceCredentials(roleName);

  if (Date.now() >= AWSInstanceCredentialsCache.expireTime) {
    // Fetch new credentials.
    AWSInstanceCredentialsCache = await fetchAWSInstanceCredentials(roleName);
  }

  return AWSInstanceCredentialsCache;
}
