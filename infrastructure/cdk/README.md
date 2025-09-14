Infrastructure (AWS CDK) - D1

Includes a minimal CDK app that provisions:
- S3 bucket + CloudFront for static frontend hosting
- WAFv2 WebACL associated with CloudFront
- API Gateway (REST) with a GET /health path
- Lambda (Node.js) handler for /health
- DynamoDB table (pk/sk)
- Cognito User Pool + Hosted UI, with optional Google/GitHub IdPs

Usage
- Prereqs: Node.js 18+, AWS credentials, bootstrapped environment (`cdk bootstrap`).
- Install: `npm install`
- Context (optional):
  - `cognitoDomainPrefix`, `googleClientId`, `googleClientSecret`, `githubClientId`, `githubClientSecret`,
  - `oauthCallbackUrls` (array), `oauthLogoutUrls` (array)
- Synthesize: `npm run synth`
- Deploy: `npm run deploy`

Outputs
- `CloudFrontURL`: Frontend distribution URL
- `ApiBaseUrl`, `HealthEndpoint`: API endpoints
- `CognitoHostedUiBase`: Hosted UI base domain

