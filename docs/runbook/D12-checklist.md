# D12 Checklist – Weekly Tech Trends (Lightweight)

Goal
- Provide 3 lightweight weekly trend cards derived from recent GitHub activity metrics per tenant/user.

Implementation
- API (BriefingApiFunction):
  - GET /insights/trends → returns cached weekly trend cards based on latest `GITHUB#SUMMARY#` items.
  - Caching: stores result under `INSIGHT#TRENDS#<YYYY-WW>` with TTL 7d to reduce cost.
- Web UI:
  - Insights page shows a “Weekly Tech Trends” section with 3 cards above the checklist.
- Proxies:
  - GET /api/insights/trends → backend proxy.

How to test
1) Ensure GitHub summaries exist (D5). If not, trigger collection once.
2) Open `/insights` → verify 3 trend cards render with values and ▲/▼ delta.
3) Refresh; confirm cache hits are returned (response includes `source: cache` after first compute).

Security/NFR
- Per-tenant/user partition keys enforced.
- Small response (<2KB); fast DDB queries; UI loads under typical p95 targets.

