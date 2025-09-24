# D10 Checklist — Insights/Report & Finalize

Goal
- Today dashboard: calendar → 1:1 → briefing 경로, 체크리스트 저장, OKR/태스크 확인 스텁.

Implementation
- API (reused BriefingApiFunction):
  - `GET/POST /insights/checklist` store under `CHECKLIST#YYYY-MM-DD` per tenant/user.
- Web UI:
  - `/calendar` list next 90m / 24h 1:1 meetings with actions (Generate Briefing, View Briefings).
  - `/insights` Today checklist with 3 default items; Save and completion indicator.
  - Home links to Today/Calendar.

How to test
1) Ensure Calendar function has a token (env) or pass `access_token` when needed.
2) Open `/calendar` and generate a briefing for a meeting, then check `/briefing`.
3) Open `/insights` and toggle all items → Save → 확인 문구 표시.

Notes
- OKR/태스크 연동은 스텁으로 저장 구조만 제공(확장 여지).

