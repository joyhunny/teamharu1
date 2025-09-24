# D8 Checklist — Briefing UI & Private Notes

Goal
- Expose recent briefings UI and allow private notes per briefing.

Implementation
- API (Lambda):
  - `GET /briefing/list` → recent `BRIEFING#*` items (DDB)
  - `GET /briefing/get?sk=...` → load briefing artifact from S3 (bucket/key from DDB)
  - `GET /briefing/note?sk=...` / `POST /briefing/note` → read/write private note (`pk=TENANT#..`, `sk=NOTE#<BRIEFING sk>`)
- Web:
  - `/briefing` list page
  - `/briefing/view?sk=...` detail + private notes editor
  - Proxies under `/api/briefing/*`

How to test
1) Ensure a briefing exists (run D7 generate if needed).
2) Web local: set `API_BASE_URL=<ApiBaseUrl>`, open `/briefing` → select one → view details.
3) Add note → save → refresh to verify persistence.

Security/NFR
- S3 remains private; fetch via Lambda.
- Notes stored per tenant/user; payloads small; latency minimal.

