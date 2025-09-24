Title: D10 — Insights/Report Finalization

Summary
- Added Today dashboard: calendar → 1:1 → briefing path, and a simple checklist with save/confirm.
- Extended Briefing API for checklist storage.
- Added Calendar UI with quick actions to generate/view briefings.

How To Test
1) Calendar: open `/calendar` to see upcoming 1:1s and click Generate Briefing; verify in `/briefing`.
2) Insights: open `/insights`, toggle items and Save; completion indicator appears when all done.

Rollback Plan
- Remove checklist routes and UI pages; keep core D4–D9 features.

Notes
- OKR/task wiring is a stub stored under `CHECKLIST#YYYY-MM-DD`; can be extended to real OKR data.

