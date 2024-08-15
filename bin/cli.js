#!/usr/bin/env node

import { Command } from 'commander';
import { checkAWSConfig, getRegion, getMainLogGroup, getLogGroup, getLogStream, streamLogs } from '../lib/utils.js';
import { AWSError } from '../lib/errors.js';

const program = new Command();

program
  .version('1.0.0')
  .description('CLI Tool to read CloudWatch logs easily from the console');

program
  .command('logs')
  .description('Read CloudWatch logs')
  .action(async () => {
    try {
      console.log('Starting the log reading process...');
      const credentials = await checkAWSConfig();
      const region = await getRegion();
      const mainLogGroup = await getMainLogGroup(region, credentials);
      const logGroup = await getLogGroup(region, credentials, mainLogGroup);
      const logStream = await getLogStream(region, logGroup, credentials);
      await streamLogs(region, logGroup, logStream, credentials);
    } catch (error) {
      if (error instanceof AWSError) {
        console.error(error.message);
      } else {
        console.error('An unexpected error occurred:', error);
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
