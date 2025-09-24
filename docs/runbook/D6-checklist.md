# D6 Checklist — Google Calendar Ingestion & 1:1 Detection

Goal
- Detect upcoming 1:1 meetings via Google Calendar (read-only), return logs/API.

Implementation
- Lambda `calendar-lambda` with `GET /calendar/meetings`:
  - Queries primary calendar for next 24h.
  - Filters: attendees exactly two OR title contains 1:1 keywords.
  - `next90m` subset and `upcoming24h` list, with counts and latency.
  - Requires OAuth access token (query `access_token`) or env `GOOGLE_ACCESS_TOKEN` (demo only).
- Next.js proxy: `GET /api/calendar/meetings`.

How to test
1) Deploy CDK: `cd infrastructure/cdk && npm install && npm run deploy`.
2) Acquire Google Calendar OAuth 2.0 access token with `https://www.googleapis.com/auth/calendar.readonly`.
3) Call: `GET <CalendarMeetingsEndpoint>?access_token=<token>`.
4) Or locally: set `API_BASE_URL=<ApiBaseUrl>` then open `/api/calendar/meetings?access_token=<token>`.

Security/NFR
- Read-only scope only; token passed via HTTPS; do not persist tokens.
- Response payload is small; latency target P95 ≤ 120s (remote API bound). Add metrics later if needed.

