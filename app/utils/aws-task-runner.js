import AWS from 'aws-sdk';
import EventEmitter from 'events';

import config from '../config';

/**
 * Initializes the AWSTaskRunner abstracting the configuration that is set
 * throught the environment variables defined in the AWS runtime.
 *
 * @param {string} taskName Name of the task to run.
 * @param {object} params params
 * @param {string} params.environment The env variables to pass the task
 * @param {string} params.taskDefinition The task definition of the task.
 * @param {string} params.logGroupName Group name for the logs.
 * @param {string} command The command to run in the container. (optional)
 *
 * Expected env variables.
 * @param {string} AWS_CLUSTER
 * @param {string} AWS_SUBNET
 * @param {string} AWS_SEC_GROUP
 * @param {string} AWS_LOG_STREAM_PREFIX
 *
 * @throws Error if env variables are missing.
 */
export function prepareAWSTask (taskName, params, command = null) {
  // Perform check of env variables.
  const globalVars = [
    'AWS_CLUSTER',
    'AWS_SUBNET',
    'AWS_SEC_GROUP',
    'AWS_LOG_STREAM_PREFIX'
  ].filter(v => !process.env[v]);

  if (globalVars.length) {
    throw new Error(`Missing env vars on AWS task: ${globalVars.join(', ')}`);
  }

  const {
    AWS_CLUSTER,
    AWS_SUBNET,
    AWS_SEC_GROUP,
    AWS_LOG_STREAM_PREFIX
  } = process.env;

  const baseEnv = {
    STORAGE_ENGINE: 's3',
    // These are not needed but are here for reference.
    STORAGE_HOST: '--not-used--',
    STORAGE_PORT: '--not-used--',
    STORAGE_BUCKET: config.storage.bucket,
    STORAGE_REGION: config.storage.region,
    CONVERSION_DIR: '/conversion',
    ...params.environment
  };

  const options = {
    cluster: AWS_CLUSTER,
    taskDefinition: params.taskDefinition,
    subnets: [AWS_SUBNET],
    securityGroups: [AWS_SEC_GROUP],
    logGroupName: params.logGroupName,
    // ex: ecs/ram-vt/
    logStreamPrefix: `${AWS_LOG_STREAM_PREFIX}/${taskName}/`
  };

  const awsTask = new AWSTaskRunner(taskName, options);
  awsTask
    .env(baseEnv)
    .command(command);
  return awsTask;
}

/**
 * Runs a AWS Task, pooling the server for logs at regular intervals.
 *
 * The run() command returns a tuple:
 * `.promise` - A promise that resolves with a boolean value that reflects the
 * task exit code. True if the task succeedded, false otherwise.
 * `.kill` - A kill switch that terminated the task.
 *
 * The AWSTaskRunner emits a data event everytime a log is found.
 * @example awsTask.on('data', ({ message }) => {});
 *
 * @param {string} taskName Name of the task as defined in the could
 *                          formation template.
 * @param {object} options Options
 * @param {string} options.cluster The cluster where the task runs.
 * @param {string} options.taskDefinition The task definition of the task.
 * @param {string} options.subnets Subnet id where the machine runs.
 * @param {string} options.securityGroups Security group where the machine runs.
 * @param {string} options.logGroupName Group name for the logs.
 * @param {string} options.logStreamPrefix Log stream prefix.
 */
class AWSTaskRunner extends EventEmitter {
  constructor (taskName, options) {
    super();

    this.options = options;
    this.taskName = taskName;
    this.envVars = {};
    this.commandName = null;

    // Time interval for status fetching.
    this.poolTime = 5000;

    // Kill control.
    this.killed = false;

    // Task id is set after running.
    this.taskId = null;

    this.lastTaskStatus = null;
  }

  env (_) {
    if (_) {
      this.envVars = _;
      return this;
    }
    return this.envVars;
  }

  command (_) {
    if (_) {
      this.commandName = _;
      return this;
    }
    return this.commandName;
  }

  async run () {
    console.log('this.envVars', this.envVars);
    const environment = Object.keys(this.envVars).map(k => ({
      name: k,
      value: this.envVars[k] + ''
    }));
    const command = this.commandName ? { command: [this.commandName] } : {};

    const {
      cluster,
      taskDefinition,
      subnets,
      securityGroups,
      logGroupName,
      logStreamPrefix
    } = this.options;

    const params = {
      cluster: cluster,
      taskDefinition: taskDefinition,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: subnets,
          assignPublicIp: 'ENABLED',
          securityGroups: securityGroups
        }
      },
      overrides: {
        containerOverrides: [
          {
            name: this.taskName,
            // Will be included if it was set.
            ...command,
            environment
          }
        ]
      }
    };

    const task = await runTask(params);

    // Create a logger function.
    const l = (message, extra = {}) => this.emit('data', { message, ...extra });

    // Get the task Id.
    this.taskId = task.taskArn.split('/')[1];

    const logStreamName = `${logStreamPrefix}${this.taskId}`;
    // Store the log token so we can get only the new logs.
    let logNextToken = null;

    do {
      if (this.killed) return false; // Sanity check.
      l(`Checking aws task status in ${this.poolTime / 1000} seconds...`);
      await sleep(this.poolTime);

      if (this.killed) return false; // Sanity check.
      l('Checking aws task status');
      this.lastTaskStatus = await getTask(cluster, task.taskArn);

      try {
        if (this.killed) return false; // Sanity check.
        // Try to get the logs. It is possible that the stream does not
        // exist yet.
        const logs = await getLogs(logGroupName, logStreamName, logNextToken);
        if (this.killed) return false; // Sanity check.
        // Emit any logs that were found
        if (logs.events && logs.events.length) {
          logs.events.forEach(log => l(log.message));
        }
        // Store token for next iteration.
        if (logs.nextForwardToken) {
          logNextToken = logs.nextForwardToken;
        }
      } catch (error) {
        if (error.name !== 'ResourceNotFoundException') {
          // Clean up.
          this.removeAllListeners();
          throw error;
        }
      }

      const { lastStatus, exitCode } = this.lastTaskStatus.containers[0];
      if (lastStatus === 'STOPPED') {
        // Clean up.
        this.removeAllListeners();
        return exitCode === 0;
      }
    } while (true);
  }

  async kill () {
    if (!this.taskId) {
      throw new Error('Task id is not set. Did the task start?');
    }
    this.killed = true;
    // Clean up.
    this.removeAllListeners();
    return stopTask(this.options.cluster, this.taskId, 'Task aborted via ram');
  }

  getLastStatus () {
    return this.lastTaskStatus;
  }
}

/**
 * Creates a promise that resolves after the given number of milliseconds.
 *
 * @param {number} millis Number of milliseconds to wait.
 */
async function sleep (millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

/**
 * Promisifies version of ecs.runTask()
 * Starts a given task.
 *
 * @param {object} params
 * @returns First task
 */
async function runTask (params) {
  var ecs = new AWS.ECS({ apiVersion: '2014-11-13', region: 'us-east-1' });
  return new Promise((resolve, reject) => {
    ecs.runTask(params, function (err, data) {
      if (err) return reject(err);
      return resolve(data.tasks[0]);
    });
  });
}

/**
 * Promisifies version of ecs.stopTask()
 * Stops a given task.
 *
 * @param {string} cluster Cluster where the task is running.
 * @param {string} taskId Id of the task.
 * @param {string} reason Reason to stop the task
 */
async function stopTask (cluster, taskId, reason) {
  var ecs = new AWS.ECS({ apiVersion: '2014-11-13', region: 'us-east-1' });
  return new Promise((resolve, reject) => {
    ecs.stopTask({ cluster, task: taskId, reason }, function (err, data) {
      if (err) return reject(err);
      return resolve(data.task);
    });
  });
}

/**
 * Promisifies version of ecs.describeTasks()
 * Gets information about a given task.
 *
 * @param {string} cluster Cluster where the task is running.
 * @param {string} task Id of the task.
 */
async function getTask (cluster, task) {
  var ecs = new AWS.ECS({ apiVersion: '2014-11-13', region: 'us-east-1' });
  return new Promise((resolve, reject) => {
    var dparams = { cluster, tasks: [task] };
    ecs.describeTasks(dparams, function (err, data) {
      if (err) return reject(err);
      return resolve(data.tasks[0]);
    });
  });
}

/**
 * Promisifies version of cloudwatchlogs.getLogEvents()
 * Gets the logs from a cloudwatch log stream.
 *
 * @param {string} logGroupName Log group.
 * @param {string} logStreamName Log stream.
 * @param {string} logNextToken Token for next batch of results. (optional)
 */
async function getLogs (logGroupName, logStreamName, logNextToken = null) {
  var cloudwatchlogs = new AWS.CloudWatchLogs({
    apiVersion: '2014-03-28',
    region: 'us-east-1'
  });
  return new Promise((resolve, reject) => {
    var params = {
      logGroupName,
      logStreamName,
      startFromHead: true,
      startTime: 0,
      nextToken: logNextToken
    };
    cloudwatchlogs.getLogEvents(params, function (err, data) {
      if (err) return reject(err);
      return resolve(data);
    });
  });
}
