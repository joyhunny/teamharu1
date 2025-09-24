Title: D14 – 성능/보안 하드닝 & 관측성

Summary
- Step Functions(브리핑 생성) SLO 알람(p95/avg/max)과 실패 알람 추가, 대시보드 위젯 구성.
- S3/DynamoDB 암호화(KMS 관리형) 설정.
- GitHub 수집 람다에 429/503 백오프 재시도 추가.
- Billing 비용 스파이크 알람(플레이스홀더) 추가.

How To Test
1) 배포 후 CloudWatch 대시보드에서 Briefing Exec Time/Failures 위젯 확인.
2) `/api/briefing/generate` 호출로 실행시간 메트릭 유입 확인.
3) `/api/github/collect` 호출 시 네트워크 에러/429 강제(모의) → 재시도/완료 여부 로그 확인.
4) 콘솔에서 S3 버킷/테이블 암호화가 KMS 관리형으로 설정되었는지 확인.

Rollback Plan
- CDK 스택에서 추가한 알람/위젯/암호화 설정/코드 변경 롤백.

Notes
- Billing 알람은 관리 계정 및 US-East-1 메트릭 노출 전제.

