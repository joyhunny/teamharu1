# D5 Checklist — Weekly Summary v1

- Goal: Contribution/Complexity/Collaboration summary + dashboard card

Implementation
- API: `GET /github/summary?tenantId&userId&limit` returns latest summaries from DynamoDB (pk=TENANT#<t>#USER#<u>, sk begins_with GITHUB#SUMMARY#)
- Lambda collect adds `metrics` (contributions, collaboration, complexity) and `narrative` to summary items.
- Web: `/summary` page shows 3 KPI cards, breakdown, narrative, and simple history table.
- Proxies: `GET /api/github/summary` to backend.

How to test
1) Ensure D4 collection has been run at least once:
   - `GET <GithubCollectEndpoint>?org=<org>&repo=<repo>&days=7`
2) Web (local): set `API_BASE_URL=<ApiBaseUrl>` and start Next.js
3) Open `/summary` and verify metrics and history render.

Security/NFR
- Read-only query of tenant/user partition; no PII in response beyond counts/derived metrics.
- Keep batch collection under P95 120s target; UI is static fetch with small payload.

