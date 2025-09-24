Title: D9 — Notification Channels (SES/Slack) & T-1h Alert

Summary
- Added `notify-lambda` with per-user notification settings and Google Calendar T-1h scan.
- Supports SES email and Slack webhook; EventBridge schedule runs every 5 minutes.
- Exposed APIs: `GET/POST /notify/settings`, `GET /notify/preview`; added `/notify` UI.

How To Test
1) Configure SES sender, Slack webhook, and Google token (optional) in CDK `.env`.
2) Deploy CDK; grab `NotifyPreviewEndpoint` and `ApiBaseUrl`.
3) Web: `API_BASE_URL=<ApiBaseUrl>`, open `/notify`, enable channels and save.
4) Trigger preview: `/api/notify/preview?access_token=<token>` (or rely on env token).
5) When a 1:1 is within 60 minutes, check email/Slack for alert with link to `/briefing`.

Rollback Plan
- Remove EventBridge rule, `NotifyFunction`, and API routes; revert web UI.

Notes
- Production: use Cognito tokens and per-user calendar tokens; add metrics/alarms for failures and latency.

