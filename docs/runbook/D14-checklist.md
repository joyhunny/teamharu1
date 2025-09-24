# D14 Checklist – 성능/보안 하드닝 & 관측성

Goal
- 브리핑 생성 파이프라인 SLO(평균 60s / P95 120s / 상한 2m) 관측 및 알림.
- 보안/비용 하드닝: 암호화, 최소권한, 백오프, 비용 알림.

Implementation
- Observability (CDK):
  - Step Functions `ExecutionTime` p95/avg/max 메트릭 위젯/알람 추가.
  - `ExecutionsFailed` 알람 추가.
  - Billing `EstimatedCharges`(USD) 비용 스파이크 알람(플레이스홀더) 추가.
- Security:
  - S3 정적 버킷, DynamoDB 테이블 AWS 관리형 KMS 암호화 사용 설정.
  - Lambda X-Ray 추적 활성화(기존 유지).
- Resilience:
  - GitHub 수집 람다의 외부 호출 429/503 지수 백오프 재시도 적용.

How to test
1) CDK Synth/Deploy 후 CloudWatch 대시보드에서 Step Functions 위젯 확인.
2) 브리핑 생성(POST `/api/briefing/generate`) 후 `ExecutionTime` 메트릭 변화 확인.
3) GitHub 수집(`/api/github/collect`)에 대해 GitHub API 제한 상황(모의) 시 재시도 로직이 오류 없이 통과하는지 CloudWatch 로그로 확인.
4) S3/DynamoDB 리소스 암호화 설정이 콘솔에 표시되는지 확인.

Notes
- Billing 알람은 관리 계정/리전에 따라 동작 범위가 다를 수 있음(US-East-1 기준).

