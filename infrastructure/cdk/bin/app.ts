import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { TeamHRStack } from '../lib/teamhr-stack';

const app = new App();

new TeamHRStack(app, 'TeamHR-D1', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

