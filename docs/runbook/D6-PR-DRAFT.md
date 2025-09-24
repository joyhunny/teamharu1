Title: D6 — Google Calendar Read-only Ingestion & 1:1 Detection

Summary
- Added `calendar-lambda` with `GET /calendar/meetings` to list upcoming 1:1s for next 24h and next 90m window.
- Detection rules: attendees==2 (non-declined) OR title contains 1:1 keywords. Returns counts and lists.
- Next.js proxy added for local testing.

How To Test
1) Deploy: `cd infrastructure/cdk && npm install && npm run deploy`.
2) Use a Google OAuth access token with `calendar.readonly` scope.
3) Call API: `curl "<CalendarMeetingsEndpoint>?access_token=<token>"`.
4) Or local web: set `API_BASE_URL=<ApiBaseUrl>` and open `/api/calendar/meetings?access_token=<token>`.

Rollback Plan
- Remove CalendarFunction and route wiring from stack; revert web proxy.

Notes
- Future: Integrate with Cognito Google IdP token exchange; add event ingestion to DDB and attach correlation IDs.

