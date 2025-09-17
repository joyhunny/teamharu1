Title: D1 – Infra Skeleton, Hosted UI, Health Endpoint

Summary
- Provisioned S3+CloudFront (OAI), WAF (AWS managed rules), API Gateway + Lambda `/health`, DynamoDB (pk/sk), Cognito User Pool + Hosted UI + optional Google IdP.
- Web scaffold (Next.js app dir) with `/health` route.
- Observability wired: API/WAF metrics, alarms; SLO for `/health` p50 60ms, p95 120ms; dashboard widgets.
- Security hardening: HTTPS-only OAuth, no implicit flow; ABAC-ready via Cognito custom `tenantId` attribute and resource server scopes `tenant.read`, `tenant.write`.

How To Test
1) Deploy: `cd infrastructure/cdk && npm install && npm run deploy`
2) Verify Outputs in CDK: CloudFront URL, API base URL, Health endpoint, Cognito Hosted UI base.
3) Health check: open `<HealthEndpoint>` — expect `{ status: 'ok', ... }` with HTTP 200.
4) Hosted UI: visit `<CognitoHostedUiBase>/login?client_id=<clientId>&response_type=code&scope=openid+email+profile+<tenant.read>+<tenant.write>&redirect_uri=<callbackUrl>`
5) CloudWatch: check dashboard `<resourcePrefix>-ops-<stackName>`; alarms for API latency p50/p95 and `/health` SLO present.

Rollback Plan
- Full: `cd infrastructure/cdk && npm run destroy`
- Partial: revert last deployment to previous commit and `cdk deploy`.

Notes
- Screenshots placeholders: put images under `docs/runbook/assets/D1/` named `hosted-ui.png`, `health.png`.
- Next (D2): Add DynamoDB GSIs for meetings/summaries and tenant middleware in web/API.
