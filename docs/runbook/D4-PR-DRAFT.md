Title: D4 — GitHub OAuth & 7d Events Aggregation

Summary
- Added GitHub OAuth starter and callback: `GET /oauth/github/start`, `GET /oauth/github/callback` (minimal scopes `read:org, repo`).
- Added events collection endpoint: `POST/GET /github/collect?org=<org>&repo=<repo>&days=7` that fetches commits, PRs, reviews, review comments, issue comments, commit comments; stores a summary in DynamoDB with TTL.
- Added Next.js proxy routes for local testing.

How To Test
1) Deploy CDK: `cd infrastructure/cdk && npm install && npm run deploy`
2) From Outputs, copy `GithubStartAuth` and `GithubCollectEndpoint` (and `ApiBaseUrl`).
3) Start OAuth: open `<GithubStartAuth>?tenantId=t-demo&userId=u-demo` (requires configured GitHub OAuth App secrets).
   - Demo fallback: set `GITHUB_TOKEN` (PAT) in `infrastructure/cdk/.env` to use for collection if OAuth not configured.
4) Collect events: `curl "<GithubCollectEndpoint>?org=<org>&repo=<repo>&days=7"` and check JSON counts/sample. Also persists `GITHUB#SUMMARY#...` item.

Rollback Plan
- Full: `cd infrastructure/cdk && npm run destroy`
- Partial: remove GitHub lambda and API resources from stack and redeploy.

Notes
- Security: For production, encrypt OAuth tokens using KMS or Secrets Manager and scope tokens to least privilege.
- Observability: Add explicit CloudWatch metrics for counts and latency; alarms to meet P95 ≤ 120s batch SLO.

