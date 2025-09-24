# D11 Checklist — Personal Roadmap Draft

Goal
- Create/edit/approve/share a personal roadmap draft using recent activity.

Implementation
- API (BriefingApiFunction):
  - GET /roadmap/list, GET /roadmap/get?rid=..., POST /roadmap/save, POST /roadmap/approve, POST /roadmap/share
  - DDB items under ROADMAP#<rid> per tenant/user, with goals[], status
- Web UI:
  - /roadmap list, /roadmap/edit?rid=... editor with “Generate Draft” (seeds from latest GitHub summary metrics), Save, Approve, Share

How to test
1) Ensure a GitHub summary exists (D5). If not, run collection once.
2) Open /roadmap/edit → “Generate Draft” → Save → verify in list.
3) Approve → status changes → Share link returns URL.

Security/NFR
- Per-tenant/user partitioning; small payloads; quick responses.

