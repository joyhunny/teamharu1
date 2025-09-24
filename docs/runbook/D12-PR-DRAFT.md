Title: D12 – Weekly Tech Trends (Lightweight)

Summary
- Adds GET `/insights/trends` to return 3 weekly trend cards from recent GitHub summaries with DynamoDB caching. Updates Insights UI to display the cards.

How To Test
1) Generate GitHub summaries if needed: `/api/github/collect?org=<org>&repo=<repo>&days=7` and check `/summary`.
2) Open `/insights` and verify “Weekly Tech Trends” shows 3 cards with value and ▲/▼ delta.
3) Reload page; expect `source: cache` on subsequent API responses.

Rollback Plan
- Remove `/insights/trends` route wiring in CDK and API handler.
- Remove proxy route and UI section from Insights page.

Notes
- Future: enrich trends with calendar load, PR lead time, and anomaly flags.

