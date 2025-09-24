Title: D11 — Personal Roadmap Draft

Summary
- Roadmap CRUD APIs and UI to draft/approve/share a personal roadmap seeded from recent GitHub activity.

How To Test
1) Generate or ensure a recent GitHub summary (D5).
2) Open /roadmap/edit and click Generate Draft, then Save.
3) Approve to lock the roadmap; Share to get a link.

Rollback Plan
- Remove roadmap routes and UI; data remains in DDB.

Notes
- Future: add real OKR/task integration and sharing permissions.

