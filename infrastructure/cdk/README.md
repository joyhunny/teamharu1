Infrastructure (AWS CDK) - D1

Includes a minimal CDK app that provisions:
- S3 bucket + CloudFront for static frontend hosting
- WAFv2 WebACL associated with CloudFront
- API Gateway (REST) with GET /health, POST /tenant, POST /invite, GET /invite/{token}
- Lambda (Node.js) handlers for health, tenant onboarding, invite flow
- DynamoDB table (pk/sk) with TTL (`ttl`) and GSIs (GSI1, GSI2)
- Cognito User Pool + Hosted UI, with optional Google/GitHub IdPs

Usage
- Prereqs: Node.js 18+, AWS credentials, bootstrapped environment (`cdk bootstrap`).
- Install: `npm install`
- Context (optional):
  - `cognitoDomainPrefix`, `googleClientId`, `googleClientSecret`, `githubClientId`, `githubClientSecret`,
  - `oauthCallbackUrls` (array), `oauthLogoutUrls` (array)
  - Same keys can also be provided via the `.env` file using their uppercase variants.
  - D3 (invites): `SES_SENDER` (verified SES email), optional; invite redirects use `CloudFrontURL` output.
- Synthesize: `npm run synth`
- Deploy: `npm run deploy`

AWS Credentials & Configuration
- Option A) AWS CLI profiles (recommended)
  1. Configure: `aws configure --profile <your-profile>`
  2. Export or set in shell:
     - PowerShell: `$env:AWS_PROFILE="<your-profile>"; $env:AWS_REGION="ap-northeast-2"`
     - CMD: `set AWS_PROFILE=<your-profile>` / `set AWS_REGION=ap-northeast-2`
- Option B) .env file (local only)
  - Create `infrastructure/cdk/.env` from `.env.example` with:
    - `AWS_ACCOUNT_ID`, `AWS_REGION`, optional `AWS_PROFILE`
    - `RESOURCE_PREFIX` (e.g., `team-ai`)
    - `COGNITO_DOMAIN_PREFIX` (optional)
    - Optional IdP secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, etc. (Google IdP is auto-enabled when both are set.)
    - `OAUTH_CALLBACK_URLS` / `OAUTH_LOGOUT_URLS` accept comma-separated values or JSON arrays.

Resource naming prefix
- Pass prefix via CDK context or env:
  - Context: `npx cdk deploy -c resourcePrefix=team-ai`
  - Env: `RESOURCE_PREFIX=team-ai npm run deploy`

OAuth/Cognito settings
- Context or env can provide callback/logout URLs and IdP secrets (env takes precedence when both are present).
- Providing GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET exposes the Google button on the Cognito Hosted UI.
- For real deployments, prefer AWS Secrets Manager/SSM Parameter Store over plain env.

Outputs
- `CloudFrontURL`: Frontend distribution URL
- `ApiBaseUrl`, `HealthEndpoint`, `TenantEndpoint`, `InviteEndpoint`: API endpoints
- `CognitoHostedUiBase`: Hosted UI base domain


