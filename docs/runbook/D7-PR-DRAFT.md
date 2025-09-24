Title: D7 — Step Functions Orchestration (GenerateBriefing)

Summary
- Added Step Functions state machine to generate briefing JSON from recent GitHub summaries and write to S3.
- Added DLQ for failures, retries with backoff on each task.
- Exposed `POST /briefing/generate` API to trigger executions.

How To Test
1) Deploy CDK and copy outputs: `BriefingGenerateEndpoint`.
2) Trigger: `curl -X POST '<BriefingGenerateEndpoint>' -H 'content-type: application/json' -d '{"tenantId":"t-demo","userId":"u-demo","meeting":{"id":"evt-1","title":"1:1"}}'`
3) Observe Step Functions execution and confirm S3 object & DDB index written.

Rollback Plan
- Remove state machine, bucket, Lambdas and API route from stack; revert web proxy.

Notes
- Future: integrate Bedrock for LLM generation, signed URLs for sharing, and EventBridge schedule trigger before meetings.

