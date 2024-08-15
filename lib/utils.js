

import inquirer from 'inquirer';
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  paginateDescribeLogGroups,
  paginateDescribeLogStreams
} from '@aws-sdk/client-cloudwatch-logs';
import { STSClient, GetSessionTokenCommand } from '@aws-sdk/client-sts';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { regions } from './constants.js';
import { AWSError } from './errors.js';

const spinner = ora();
const CONFIG_PATH = path.join(homedir(), '.cwlogs-config.json');
const MAX_LOG_LINES = 1000;
const MAX_FETCH_LINES = 200;

export const checkAWSConfig = async () => {
  console.log('Checking AWS Config...');
  let credentials = await loadStoredCredentials();

  if (!validateCredentials(credentials)) {
    credentials = await getCredentialsFromUser();
    await storeCredentials(credentials);
  }

  if (!credentials.sessionToken) {
    try {
      credentials = await generateSessionToken(credentials);
      await storeCredentials(credentials);
    } catch (error) {
      console.log(chalk.red('Failed to get session token. Please check your AWS credentials.'));
    }
  }

  return credentials;
};

const loadStoredCredentials = async () => {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    const credentials = JSON.parse(data);
    if (validateCredentials(credentials)) {
      return credentials;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
};

const validateCredentials = (credentials) => {
  return (
    credentials &&
    credentials.accessKeyId &&
    credentials.secretAccessKey &&
    typeof credentials.accessKeyId === 'string' &&
    typeof credentials.secretAccessKey === 'string' &&
    credentials.accessKeyId.trim() !== '' &&
    credentials.secretAccessKey.trim() !== ''
  );
};

const storeCredentials = async (credentials) => {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(credentials), 'utf8');
};

const getCredentialsFromUser = async () => {
  console.log('Prompting user for AWS credentials...');
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'accessKeyId',
      message: 'Enter your AWS Access Key ID:'
    },
    {
      type: 'password',
      name: 'secretAccessKey',
      message: 'Enter your AWS Secret Access Key:'
    },
    {
      type: 'input',
      name: 'sessionToken',
      message: 'Enter your AWS Session Token (if any):',
      mask: '*',
      default: ''
    },
    {
      type: 'list',
      name: 'region',
      message: 'Select AWS Region:',
      choices: regions
    }
  ]);

  return {
    accessKeyId: answers.accessKeyId,
    secretAccessKey: answers.secretAccessKey,
    sessionToken: answers.sessionToken || undefined,
    region: answers.region
  };
};

const handleExpiredToken = async (region) => {
  console.log(chalk.red('The security token is expired. Requesting new credentials.'));
  const newCredentials = await getCredentialsFromUser();
  await storeCredentials(newCredentials);
  return newCredentials;
};

const generateSessionToken = async (credentials) => {
  const stsClient = new STSClient({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey
    }
  });

  try {
    const data = await stsClient.send(new GetSessionTokenCommand({ DurationSeconds: 3600 }));
    credentials.sessionToken = data.Credentials.SessionToken;
    await storeCredentials(credentials);
    return credentials;
  } catch (error) {
    throw new AWSError('Failed to get session token. Please check your AWS credentials.');
  }
};

export const getRegion = async () => {
  console.log('Prompting user to select AWS region...');
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'region',
      message: 'Select AWS Region:',
      choices: regions
    }
  ]);
  return answers.region;
};

const fetchAllLogGroups = async (client) => {
  const paginator = paginateDescribeLogGroups({ client }, {});
  const logGroups = [];
  for await (const page of paginator) {
    logGroups.push(...page.logGroups);
  }
  return logGroups;
};

const filterLogGroupsByDate = (logGroups, filter) => {
  const now = new Date();
  return logGroups.filter(group => {
    const creationDate = new Date(group.creationTime);
    if (filter === 'all') {
      return true;
    } else if (filter === 'year') {
      return creationDate.getFullYear() === now.getFullYear();
    } else if (filter === 'month') {
      return (
        creationDate.getFullYear() === now.getFullYear() &&
        creationDate.getMonth() === now.getMonth()
      );
    } else if (filter === 'day') {
      return (
        creationDate.getFullYear() === now.getFullYear() &&
        creationDate.getMonth() === now.getMonth() &&
        creationDate.getDate() === now.getDate()
      );
    }
    return false;
  });
};

export const getMainLogGroup = async (region, credentials) => {
  console.log('Fetching main log groups...');
  const cloudwatchLogsClient = new CloudWatchLogsClient({ region, credentials });
  spinner.start('Fetching main log groups...');
  try {
    let logGroups = await fetchAllLogGroups(cloudwatchLogsClient);
    spinner.stop();

    if (logGroups.length === 0) {
      throw new AWSError('No log groups found.');
    }

    const mainGroups = Array.from(new Set(logGroups.map(group => {
      const parts = group.logGroupName.split('/');
      return parts.length > 1 ? parts[1] : group.logGroupName;
    })));

    const choices = mainGroups.map(group => ({
      name: group,
      value: group
    }));

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'mainLogGroup',
        message: 'Select Main Log Group:',
        choices
      }
    ]);

    return answers.mainLogGroup;
  } catch (error) {
    spinner.stop();
    if (error.name === 'ExpiredTokenException' || error.name === 'UnrecognizedClientException') {
      console.log(chalk.red('The security token is expired or invalid. Requesting new credentials.'));
      const newCredentials = await handleExpiredToken(region);
      return getMainLogGroup(region, newCredentials);
    } else {
      throw new AWSError('An error occurred while fetching main log groups: ' + error.message);
    }
  }
};

export const getLogGroup = async (region, credentials, mainLogGroup, prefix = '') => {
  console.log('Fetching log groups...');
  const cloudwatchLogsClient = new CloudWatchLogsClient({ region, credentials });
  spinner.start('Fetching log groups...');
  try {
    let logGroups = await fetchAllLogGroups(cloudwatchLogsClient);
    spinner.stop();

    if (logGroups.length === 0) {
      throw new AWSError('No log groups found.');
    }

    logGroups = logGroups.filter(group => group.logGroupName.startsWith(`/${mainLogGroup}${prefix}`));

    const subGroups = Array.from(new Set(logGroups.map(group => {
      const remainingPath = group.logGroupName.slice((`/${mainLogGroup}${prefix}`).length);
      const nextSlashIndex = remainingPath.indexOf('/');
      if (nextSlashIndex !== -1) {
        return remainingPath.slice(0, nextSlashIndex + 1);
      }
      return remainingPath;
    })));

    const choices = subGroups.map(group => ({
      name: group,
      value: prefix + group
    }));

    if (choices.length > 1 || (choices.length === 1 && choices[0].name.endsWith('/'))) {
      choices.push({ name: 'Back', value: 'back' });
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'logGroup',
          message: 'Select Log Group:',
          choices
        }
      ]);

      const selectedGroup = answers.logGroup;
      if (selectedGroup === 'back') {
        return getLogGroup(region, credentials, mainLogGroup, prefix.slice(0, prefix.lastIndexOf('/', prefix.length - 2) + 1));
      } else if (selectedGroup.endsWith('/')) {
        return getLogGroup(region, credentials, mainLogGroup, selectedGroup);
      }

      return `/${mainLogGroup}${selectedGroup}`;
    } else {
      const { dateFilter } = await inquirer.prompt([
        {
          type: 'list',
          name: 'dateFilter',
          message: 'Filter log groups by date:',
          choices: [
            { name: 'All', value: 'all' },
            { name: 'This Year', value: 'year' },
            { name: 'This Month', value: 'month' },
            { name: 'Today', value: 'day' }
          ]
        }
      ]);

      logGroups = filterLogGroupsByDate(logGroups, dateFilter);
      logGroups = logGroups.sort((a, b) => b.creationTime - a.creationTime);

      const finalChoices = logGroups.map(group => ({
        name: `${group.logGroupName} (Created: ${new Date(group.creationTime).toISOString()})`,
        value: group.logGroupName
      }));

      const finalAnswers = await inquirer.prompt([
        {
          type: 'list',
          name: 'logGroup',
          message: 'Select Log Group:',
          choices: finalChoices
        }
      ]);

      return finalAnswers.logGroup;
    }
  } catch (error) {
    spinner.stop();
    if (error.name === 'ExpiredTokenException' || error.name === 'UnrecognizedClientException') {
      console.log(chalk.red('The security token is expired or invalid. Requesting new credentials.'));
      const newCredentials = await handleExpiredToken(region);
      return getLogGroup(region, newCredentials, mainLogGroup, prefix);
    } else {
      throw new AWSError('An error occurred while fetching log groups: ' + error.message);
    }
  }
};

const fetchAllLogStreams = async (client, logGroupName) => {
  const paginator = paginateDescribeLogStreams({ client }, { logGroupName });
  const logStreams = [];
  for await (const page of paginator) {
    logStreams.push(...page.logStreams);
  }
  return logStreams;
};

export const getLogStream = async (region, logGroup, credentials) => {
  console.log('Fetching log streams...');
  const cloudwatchLogsClient = new CloudWatchLogsClient({ region, credentials });
  spinner.start('Fetching log streams...');
  try {
    let logStreams = await fetchAllLogStreams(cloudwatchLogsClient, logGroup);
    spinner.stop();

    if (logStreams.length === 0) {
      throw new AWSError('No log streams found.');
    }

    logStreams = logStreams.sort((a, b) => {
      const lastEventA = a.lastEventTimestamp || 0;
      const lastEventB = b.lastEventTimestamp || 0;
      return lastEventB - lastEventA;
    });

    const choices = logStreams.map(stream => {
      const lastEvent = stream.lastEventTimestamp ? new Date(stream.lastEventTimestamp).toISOString() : 'No events';
      return {
        name: `${stream.logStreamName} (Last Event: ${lastEvent})`,
        value: stream.logStreamName
      };
    });

    choices.push({ name: 'Back', value: 'back' });

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'logStream',
        message: 'Select Log Stream:',
        choices
      }
    ]);

    if (answers.logStream === 'back') {
      return getLogGroup(region, credentials, logGroup.slice(0, logGroup.lastIndexOf('/') + 1));
    }

    return answers.logStream;
  } catch (error) {
    spinner.stop();
    if (error.name === 'ExpiredTokenException' || error.name === 'UnrecognizedClientException') {
      console.log(chalk.red('The security token is expired or invalid. Requesting new credentials.'));
      const newCredentials = await handleExpiredToken(region);
      return getLogStream(region, logGroup, newCredentials);
    } else {
      throw new AWSError('An error occurred while fetching log streams: ' + error.message);
    }
  }
};

export const streamLogs = async (region, logGroup, logStream, credentials) => {
  console.log('Starting to stream logs...');
  const cloudwatchLogsClient = new CloudWatchLogsClient({ region, credentials });
  let logBuffer = [];
  let startTime = Date.now() - 10 * 60 * 1000; // Empezar a mostrar logs desde los últimos 10 minutos
  let lastFetchHadEvents = false;

  const fetchLogs = async () => {
    try {
      const params = {
        logGroupName: logGroup,
        logStreamNames: [logStream],
        limit: MAX_FETCH_LINES,
        startTime
      };

      const data = await cloudwatchLogsClient.send(new FilterLogEventsCommand(params));

      if (!data.events.length) {
        if (!lastFetchHadEvents) {
          logBuffer.push(chalk.yellow('No log events found.'));
        }
        lastFetchHadEvents = false;
      } else {
        data.events.forEach(event => {
          logBuffer.push(chalk.green(`[${new Date(event.timestamp).toISOString()}] ${event.message}`));
        });
        startTime = data.events[data.events.length - 1].timestamp + 1; // Actualizar el tiempo de inicio al timestamp del último evento + 1
        lastFetchHadEvents = true;
      }

      // Limit the logBuffer to the MAX_LOG_LINES
      if (logBuffer.length > MAX_LOG_LINES) {
        logBuffer = logBuffer.slice(logBuffer.length - MAX_LOG_LINES);
      }

      // Clear the console and print the logBuffer
      console.clear();
      logBuffer.forEach(line => console.log(line));
    } catch (error) {
      if (error.name === 'ExpiredTokenException' || error.name === 'UnrecognizedClientException') {
        console.log(chalk.red('The security token is expired or invalid. Requesting new credentials.'));
        const newCredentials = await handleExpiredToken(region);
        credentials.accessKeyId = newCredentials.accessKeyId;
        credentials.secretAccessKey = newCredentials.secretAccessKey;
        credentials.sessionToken = newCredentials.sessionToken;
        await fetchLogs(); // Reintentar con nuevas credenciales
      } else {
        throw new AWSError('An error occurred while fetching log events: ' + error.message);
      }
    }
  };

  const intervalId = setInterval(fetchLogs, 2000);

  // Capturar la entrada del usuario para detener el streaming y volver al menú anterior
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', async (key) => {
    if (key.toString() === 'q') {
      clearInterval(intervalId);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      console.log(chalk.green('Stopped streaming logs.'));
      await promptForBack(region, logGroup, credentials);
    }
  });

  console.log(chalk.blue('Press "q" to stop streaming logs.'));
};

const promptForBack = async (region, logGroup, credentials) => {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'back',
      message: 'Do you want to go back to the previous menu?',
      default: true
    }
  ]);

  if (answers.back) {
    const logStream = await getLogStream(region, logGroup, credentials);
    await streamLogs(region, logGroup, logStream, credentials);
  } else {
    process.exit(0);
  }
};
