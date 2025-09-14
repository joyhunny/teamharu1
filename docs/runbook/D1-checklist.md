Day 1 Checklist (D1)

- Goal: CDK infra skeleton + Cognito Hosted UI + Next.js scaffold + /health

Infra (AWS CDK)
- [ ] S3 + CloudFront for static frontend
- [ ] WAFv2 attached to CloudFront (AWS managed rules)
- [ ] DynamoDB table (pk/sk)
- [ ] API Gateway REST with `GET /health`
- [ ] Lambda handler wired to `/health`
- [ ] Cognito User Pool + App Client + Hosted UI domain
- [ ] Optional: Google/GitHub IdP configured

Web (Next.js)
- [ ] i18n locales: en, ko
- [ ] `GET /health` returns 200 JSON
- [ ] Basic home page renders without errors

Observability & NFR
- [ ] Health latency targets: p50 ≤ 60ms, p95 ≤ 120ms (SLO)
- [ ] CloudWatch metrics enabled for WAF and API Gateway
- [ ] Alarms placeholders created (follow-up to wire thresholds)

Security
- [ ] OAuth over HTTPS only; no implicit flow
- [ ] ABAC-ready (scopes in place; attributes via IdPs)
- [ ] WAF common ruleset enabled

Release Artifacts
- [ ] CDK synth succeeds locally
- [ ] Deployed endpoints captured (CloudFront URL, API `/health`)
- [ ] Screenshots of Hosted UI and health check
- [ ] PR created with summary, how-to-test, rollback notes

How to Deploy (summary)
- `cd infrastructure/cdk && npm install`
- `npx cdk bootstrap` (first time per account/region)
- Set context as needed (see README): domain prefix, OAuth callback/logout URLs, IdP secrets
- `npm run deploy`

Rollback
- `npm run destroy` (if fully reverting)
- Or selectively remove changes via `cdk deploy` of previous known-good commit

