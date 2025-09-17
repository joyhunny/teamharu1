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

const account = process.env.AWS_ACCOUNT_ID ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2';

if (account) {
  new TeamHRStack(app, 'TeamHR-D1', {
    env: { account, region },
  });
} else {
  // Let CDK resolve the environment (from credentials) when account is not explicitly provided
  new TeamHRStack(app, 'TeamHR-D1', {});
}

