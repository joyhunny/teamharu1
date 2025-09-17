Day 1 Checklist (D1)

- Goal: CDK infra skeleton + Cognito Hosted UI + Next.js scaffold + /health

Infra (AWS CDK)
- [x] S3 + CloudFront for static frontend
- [x] WAFv2 attached to CloudFront (AWS managed rules)
- [x] DynamoDB table (pk/sk)
- [x] API Gateway REST with `GET /health`
- [x] Lambda handler wired to `/health`
- [x] Cognito User Pool + App Client + Hosted UI domain
- [x] Optional: Google IdP enabled via env/context (GitHub via OIDC backlog)

Web (Next.js)
- [x] i18n locales: en, ko
- [x] `GET /health` returns 200 JSON
- [x] Basic home page renders without errors

Observability & NFR
- [x] Health latency targets: p50 60ms, p95 120ms (SLO) — wired as CloudWatch alarms for GET /health
- [x] CloudWatch metrics enabled for WAF and API Gateway
- [x] Alarms placeholders created (follow-up to wire thresholds)

Security
- [x] OAuth over HTTPS only; no implicit flow
- [x] ABAC-ready (Cognito custom attribute tenantId + resource server scopes tenant.read/tenant.write)
- [x] WAF common ruleset enabled

Release Artifacts
- [x] CDK synth succeeds locally
- [x] Deployed endpoints captured (CloudFront URL, API `/health`)
  - CloudFront: https://d2s40e1eflqhlj.cloudfront.net
  - API health: https://k4hry0d1pf.execute-api.ap-northeast-2.amazonaws.com/prod/health
- [ ] Screenshots of Hosted UI and health check (drop under docs/runbook/assets/D1/)
- [ ] PR created with summary, how-to-test, rollback notes (draft prepared at docs/runbook/D1-PR-DRAFT.md)

How to Deploy (summary)
- `cd infrastructure/cdk && npm install`
- `npx cdk bootstrap` (first time per account/region)
- Set context as needed (see README): domain prefix, OAuth callback/logout URLs, IdP secrets
- `npm run deploy`

Rollback
- `npm run destroy` (if fully reverting)
- Or selectively remove changes via `cdk deploy` of previous known-good commit





