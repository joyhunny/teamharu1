Title: D8 — Briefing UI and Private Notes

Summary
- Added briefing browsing UI and private notes support.
- New Lambda API provides listing, artifact retrieval from S3, and note read/write.

How To Test
1) Generate at least one briefing (D7) or use existing.
2) Web: `API_BASE_URL=<ApiBaseUrl>`, run Next, open `/briefing`.
3) Click a briefing → view overview/metrics/agenda/questions.
4) Add a private note and save; refresh to confirm.

Rollback Plan
- Remove briefing API routes, Lambdas, and UI pages.

Notes
- Future: auth-gated access, signed URL links, and richer formatting for notes.

