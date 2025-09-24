Title: D15 – 릴리스 정보/플래그/베타 롤아웃

Summary
- 기능 플래그(`/config`)와 베타 배너 도입, 테넌트 allowlist 기반 베타 롤아웃. 릴리스 안내/체크리스트 추가.

How To Test
1) `/api/config?tenantId=t-demo` → `enabledForTenant: true` 및 플래그 값 확인.
2) `/` 방문 시 상단 베타 배너 표시.
3) `FEATURE_FLAGS.betaBanner=false` 배포 후 배너 미표시 확인.

Release Notes (메일 초안)
- 제목: [TeamHR Beta] 1:1 브리핑 베타 체험 안내
- 본문 요약: 캘린더/GitHub 기반 1:1 브리핑/트렌드/로드맵 초안 기능 베타 오픈. 점진적 롤아웃.
- 시작하기: Invite 링크, GitHub 연결, 샘플 데이터 로드 버튼 안내.
- 지원: 피드백 채널/문의 메일 포함.

Rollback Plan
- CDK 환경변수 `FEATURE_FLAGS`에서 토글(즉시 비노출).
- 필요 시 `/config` 경로/배너 컴포넌트 제거 롤백.

Notes
- 차기: AWS AppConfig 전환 및 배포 전략 연동.

