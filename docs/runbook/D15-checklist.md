# D15 Checklist – 릴리스 정보/플래그/베타 롤아웃

Goal
- 베타 롤아웃을 위한 기능 플래그 구성과 릴리스 안내/롤백 계획을 정리한다.

Implementation
- Feature Flags (demo):
  - Backend: `GET /config`에서 기능 플래그 반환(`FEATURE_FLAGS` 환경변수 기반, 테넌트 allowlist 포함).
  - CDK: `BriefingApiFunction`에 `FEATURE_FLAGS` JSON 주입(예: `betaBanner`, `trends`, `roadmap`, `rollout.tenantAllowlist`).
  - Web: `/api/config` 프록시 및 `BetaBanner` 클라이언트 컴포넌트로 베타 배너 표시.
- Rollout
  - Allowlist에 포함된 테넌트만 베타 배너 및 관련 기능 노출(확장 시 라우팅/버튼 가드 추가).
- Docs
  - 릴리스 PR 초안/체크리스트, 베타 안내 문구 포함.

How to test
1) 환경변수 `FEATURE_FLAGS`의 allowlist에 `t-demo` 포함 여부 확인(CDK 소스에서 기본 포함).
2) `/api/config?tenantId=t-demo` 호출 → `{ ok: true, flags.enabledForTenant: true }` 확인.
3) `/` 접속 → 상단 “Beta” 배너 노출 확인.
4) `FEATURE_FLAGS`에서 `betaBanner: false`로 변경 후 배포 → 배너 미노출 확인.

Security/NFR
- 플래그는 서버에서 평가하여 노출(프록시 제공). 민감 설정은 AppConfig/SSM로 이관 예정.

Notes
- 프로덕션에서는 AWS AppConfig로 전환(애플리케이션/환경/프로필, Hosted JSON + Deployment Strategy) 권장.

