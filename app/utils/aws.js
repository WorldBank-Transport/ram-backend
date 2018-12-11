'use strict';
import fetch from 'node-fetch';

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
  const awsIAMUrl = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/';
  if (!roleName) {
    const roleRes = await fetch(awsIAMUrl, { timeout: 2000 });
    if (roleRes.status >= 400) throw new Error('Unable to fetch role name');
    roleName = await roleRes.text();
  }

  const accessRes = await fetch(`${awsIAMUrl}${roleName}`, { timeout: 2000 });
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
