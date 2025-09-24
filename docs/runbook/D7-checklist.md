# D7 Checklist — Step Functions GenerateBriefing

Goal
- Orchestrate briefing generation via Step Functions, write JSON to S3, record link.

Implementation
- S3: `BriefingsBucket` private bucket for briefing JSON artifacts.
- Lambda: `BriefingFunction` with actions `load_summary`, `build_briefing`, `write_output`.
- State Machine: `GenerateBriefingMachine` = LoadSummary → BuildBriefing → WriteOutput, retries + DLQ (SQS) on failure.
- API: `POST /briefing/generate` starts execution with `{ tenantId, userId, meeting }`.
- Web: `/api/briefing/generate` proxy and home page button.

How to test
1) Deploy CDK and note outputs.
2) Trigger: `curl -X POST "<BriefingGenerateEndpoint>" -H "content-type: application/json" -d '{"tenantId":"t-demo","userId":"u-demo","meeting":{"id":"evt-1","title":"1:1"}}'`
3) Check Step Functions console for execution success.
4) Verify S3 object in `BriefingsBucket` at `tenantId/userId/meetingId/<timestamp>.json`.
5) DynamoDB record exists: `sk=BRIEFING#<meetingId>#<timestamp>`.

Security/NFR
- Artifacts are private in S3; access via AWS console or signed URLs (future).
- Orchestration retries with exponential backoff; DLQ receives failure details.

