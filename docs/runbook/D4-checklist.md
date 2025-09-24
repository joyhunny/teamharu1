# D4 Checklist — GitHub OAuth & 7d Events

- Goal: GitHub OAuth (minimal scopes) and weekly events aggregation.

Implementation
- API Gateway routes: `GET /oauth/github/start`, `GET /oauth/github/callback`, `POST/GET /github/collect`
- Lambda: `github-lambda` handles OAuth and event collection; stores connection under `pk=TENANT#<tenant>#USER#<user>`, `sk=CONN#github`.
- Scopes: `read:org, repo` (minimum for read-only aggregation).
- Next.js proxy: `GET /api/github/oauth/start`, `GET|POST /api/github/collect` for local testing.

Security
- Transport: TLS end-to-end (API GW + CloudFront).
- Token storage: plaintext for demo; production note to encrypt via KMS/Secrets Manager.
- Least privilege: Lambda has DynamoDB table read/write only.

Observability
- Writes summary item `GITHUB#SUMMARY#<timestamp>` with counts + small sample.
- Use CloudWatch Logs and function tracing for latency (P95 target 120s end-to-end batch cap).

How to test
1) Deploy CDK: `cd infrastructure/cdk && npm i && npm run deploy`
2) Note outputs:
   - `ApiBaseUrl`, `GithubStartAuth`, `GithubCollectEndpoint`
3) Set `web` environment: `API_BASE_URL=<ApiBaseUrl>` for proxy.
4) Start OAuth: open `/api/github/oauth/start?tenantId=t-demo&userId=u-demo`.
5) Collect: call `/api/github/collect?org=<org>&repo=<repo>&days=7`.

Outputs
- Changed files list (see PR summary)
- How to run/deploy
- API endpoints URLs
- Risk/blocks: require GitHub OAuth App client id/secret; fallback PAT for demo via `GITHUB_TOKEN`.

