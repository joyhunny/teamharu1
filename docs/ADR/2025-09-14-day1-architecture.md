Title: Day 1 Architecture Decisions (Infra, Auth, Web)
Date: 2025-09-14
Status: Accepted

Context
- Need a deployable skeleton to iterate quickly on TeamHR.
- Requirements: static frontend via CDN, minimal REST API, basic data store, OAuth-based auth, security guardrails, observability.

Decision
- Use AWS CDK (v2, TypeScript) to define infrastructure as code.
- Frontend: S3 (origin) + CloudFront, secured with OAI and WAF (AWS managed rules).
- API: API Gateway REST + Lambda (Node.js 18) with `/health` for baseline.
- Data: DynamoDB (on-demand) with `pk/sk` generic model.
- Auth: Cognito User Pool + Hosted UI; support Google/GitHub IdPs via context-provided secrets; OAuth scopes openid/email/profile.
- Web app: Next.js (app router) with `/health` endpoint and i18n (en, ko).

Consequences
- Enables fast iteration and self-contained deployments per environment.
- Minimal cost footprint until traffic scales (on-demand, serverless).
- IdP secrets are not committed; deployment requires secure parameterization.
- WAF managed rules provide baseline protection; fine-tuning deferred.
- Future: wire observability alarms (latency, error rate), add ABAC policies, CI/CD.

