Day 3 Checklist (D3)

Goal
- Magic-link onboarding (email invite), invite state machine, landing page hero/CTA.

Backend/API
- [x] `POST /invite` — generate 1-time token, save to DynamoDB with TTL(1h), optional SES email send
- [x] `GET /invite/{token}` — validate and mark used; redirect to `/onboarding?token=...`
- [x] CDK Outputs include `InviteEndpoint`; Lambda has TABLE_NAME, FRONTEND_URL, SES_SENDER envs

Data Model
- [x] Table TTL enabled (`ttl`)
- [x] Invite item: `pk=INVITE#<token>`, `sk=PENDING`, attributes: email, tenantId?, status, ttl

Web
- [x] Landing page top fold with CTA “Get Started” → `/invite`
- [x] Invite page with email form posts to `/api/invite` (proxy to API)
- [x] On accept, redirect to `/onboarding?token=...` (handled by API)

Observability/Security
- [ ] Wire structured logs + metrics for invite flow (follow-up)
- [ ] Protect API with Cognito Authorizer (follow-up per D2 plan)

How to Test
1) Deploy CDK, note `InviteEndpoint` and `CloudFrontURL`
2) Invite: `curl -X POST <InviteEndpoint> -H "content-type: application/json" -d '{"email":"me@example.com","tenantId":"t-demo"}'`
3) Response `acceptUrl` opens landing → redirect to onboarding
4) Web: open `<CloudFrontURL>/invite` and submit form (set `API_BASE_URL` for Next server)

Notes
- SES sender must be verified; set `SES_SENDER` in `infrastructure/cdk/.env`
- For local Next: set `API_BASE_URL` or `NEXT_PUBLIC_API_BASE` to API base URL
