Day 2 Checklist (D2)

- Goal: 멀티테넌시 설계 & 초기 온보딩 진입 경로 데모

Data Model (DynamoDB)
- [x] Single-table PK/SK 패턴 정의: `TENANT#<tenantId>`, `TENANT#<tenantId>#USER#<userId>`
- [x] GSI1 (meetings 등 1:N 조회 대비) – `gsi1pk/gsi1sk`
- [x] GSI2 (user-week summaries 등) – `gsi2pk/gsi2sk`

API & Services
- [x] `POST /tenant` (API Gateway + Lambda) – 테넌트 생성/선택 데모, DynamoDB write
- [x] Lambda에 TABLE_NAME 주입, 권한(읽기/쓰기)

Web (Next.js)
- [x] 미들웨어로 `tenantId` 감지 → 없으면 `/onboarding` 리다이렉트
- [x] Onboarding 페이지 + 데모 API(`/api/tenant/select?tenantId=...`)로 쿠키 설정

Observability & Security
- [x] 요청/에러 메트릭은 기본(APIGW)으로 수집, 추후 Authorizer/ABAC 정교화 계획 수립
- [ ] Cognito Authorizer로 API 보호 (후속 작업)

Deliverables
- [x] 데모 플로우: 신규 방문 → `/onboarding` → 쿠키 설정 또는 `POST /tenant` 호출 → 홈 접근 가능
- [x] 변경 파일 요약 및 배포 방법 문서화

How to Test (D2)
1) 배포 후 Outputs에서 `TenantEndpoint` 확인
2) 테넌트 생성 데모: `curl -X POST <TenantEndpoint> -H "content-type: application/json" -d '{"tenantId":"t-demo","userId":"u-1"}'`
3) 웹에서 `/api/tenant/select?tenantId=t-demo` 호출 후 홈 진입 확인

Notes
- 후속: Lambda Authorizer(Cognito)로 API 보호, 요청 클레임(`tenantId`)과 파티션키 정합 검증 추가
