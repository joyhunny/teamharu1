import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { TeamHRStack } from '../lib/teamhr-stack';
import * as fs from 'fs';
import * as path from 'path';

const app = new App();

// Load .env if exists (local only)
try {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const dotenv = require('dotenv');
    dotenv.config({ path: envPath });
  }
} catch {}

new TeamHRStack(app, 'TeamHR-D1', {
  env: {
    account: process.env.AWS_ACCOUNT_ID || process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.AWS_REGION || process.env.CDK_DEFAULT_REGION || 'ap-northeast-2',
  },
});

