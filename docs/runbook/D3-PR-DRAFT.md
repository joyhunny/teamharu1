Title: D3 – Magic-link Invite, Landing Hero/CTA, TTL

Summary
- Added invite flow: `POST /invite` issues 1-hour magic link token, stores in DynamoDB with TTL; optional SES email.
- Added validation: `GET /invite/{token}` marks token used and redirects to onboarding.
- Enabled table TTL (`ttl`).
- Updated landing page with hero copy + CTA to `/invite`; added `/invite` page and `/api/invite` proxy.

How To Test
1) Deploy CDK: `cd infrastructure/cdk && npm install && npm run deploy`
2) From Outputs, copy `InviteEndpoint` and `CloudFrontURL`.
3) API: `curl -X POST <InviteEndpoint> -H "content-type: application/json" -d '{"email":"me@example.com","tenantId":"t-demo"}'` → response contains `acceptUrl`.
4) Open `acceptUrl` → redirects to `/onboarding?token=...`.
5) Web form: run Next locally with `API_BASE_URL=<ApiBaseUrl>` then open `<CloudFrontURL>/invite` (or `http://localhost:3000/invite`) and submit an email.

Rollback Plan
- Full: `cd infrastructure/cdk && npm run destroy`
- Partial: revert commit and redeploy; invites are time-bound and expire via TTL.

Notes
- SES sender must be verified (`SES_SENDER` in `infrastructure/cdk/.env`), otherwise API still returns link but email send may be skipped.
- Follow-up: protect endpoints with Cognito Authorizer and add structured metrics/logs for invite flow.
