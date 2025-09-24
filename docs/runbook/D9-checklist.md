# D9 Checklist — Notification Channels (SES/Slack) & T-1h Alert

Goal
- Send meeting T-1h alerts via SES email and/or Slack; allow per-user on/off settings.

Implementation
- Lambda `notify-lambda`:
  - API: `GET/POST /notify/settings` (store under `NOTIFY#SETTINGS`), `GET /notify/preview` (run scan+notify once)
  - EventBridge rule (rate 5m) invokes notify for demo `DEFAULT_TENANT/USER` if `GOOGLE_ACCESS_TOKEN` present
  - Google Calendar scan for next 60 minutes 1:1s (title keywords or 2 attendees)
  - If found and channel enabled → send SES/Slack message with optional link to Frontend `/briefing`
- CDK: env for `SES_SENDER`, `SLACK_WEBHOOK`, `GOOGLE_ACCESS_TOKEN`, `DEFAULT_TENANT/USER`, `FRONTEND_URL`
- Web: `/notify` settings UI + `/api/notify/*` proxies

How to test
1) Configure `.env` (CDK) with `SES_SENDER` (verified), optional `SLACK_WEBHOOK`, and `GOOGLE_ACCESS_TOKEN` (readonly).
2) Deploy CDK. Note outputs including `NotifyPreviewEndpoint`.
3) Web local: set `API_BASE_URL=<ApiBaseUrl>`; open `/notify`, enable channels, set email/webhook, Save.
4) Preview: open `/api/notify/preview?access_token=<token>` (omit if env has token). Response includes count.
5) Check inbox/Slack channel when a 1:1 is within 60 minutes.

Security/NFR
- Read-only Google token; do not persist.
- SES sender must be verified. Slack webhook kept in DDB per-user setting.
- EventBridge runs every 5 minutes; keep within P95 120s and minimal payloads.

