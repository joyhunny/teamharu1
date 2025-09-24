Title: D5 — Weekly Contribution Summary (Dashboard v1)

Summary
- Added `GET /github/summary` endpoint to return latest GitHub weekly summaries per tenant/user.
- Enhanced collector to store derived metrics (contributions, collaboration, complexity) and a simple narrative.
- Implemented `/summary` page with 3 KPI cards, breakdown grid, and history table.

How To Test
1) Deploy CDK: `cd infrastructure/cdk && npm install && npm run deploy`
2) Run collection once: `curl "<GithubCollectEndpoint>?org=<org>&repo=<repo>&days=7"`
3) Web: set `API_BASE_URL=<ApiBaseUrl>`, run Next locally, open `/summary`.

Rollback Plan
- Remove `/github/summary` route wiring and UI page, redeploy.

Notes
- Future: add LLM-generated insights, trend charts, and per-tenant filters.

