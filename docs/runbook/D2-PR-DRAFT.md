Title: D2 – Multitenancy Bootstrap (DynamoDB GSIs, Tenant Middleware)

Summary
- Data model: single table with pk/sk; scaffold GSIs
  - GSI1: gsi1pk/gsi1sk (e.g., meetings time-ordered)
  - GSI2: gsi2pk/gsi2sk (e.g., summaries per user/week)
- API: `POST /tenant` (Lambda) creates/ensures tenant profile and optional user membership
- Web: `middleware.ts` redirects to `/onboarding` when `tenantId` cookie missing; `/onboarding` page & demo cookie API

How To Test
1) Deploy CDK: `cd infrastructure/cdk && npm install && npm run deploy`
2) Outputs: copy `TenantEndpoint`
3) Create/select tenant: `curl -X POST <TenantEndpoint> -H "content-type: application/json" -d '{"tenantId":"t-demo","userId":"u-1"}'`
4) Web demo (local):
   - `cd web && npm install && npm run dev`
   - Visit `http://localhost:3000` → should redirect to `/onboarding`
   - Call `/api/tenant/select?tenantId=t-demo` → cookie set → home reachable

Rollback Plan
- Revert commit and redeploy; table schema additions (GSIs) are additive (no destructive change)

Notes
- Follow-up: add Cognito Authorizer and enforce ABAC by matching token `tenantId` claim with DynamoDB partition key
