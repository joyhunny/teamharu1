# D13 Checklist – Landing Page Polish (IA/Copy/SEO)

Goal
- Publish a clear landing page with top-fold copy, IA, and basic SEO to improve signup flow.

Implementation
- Web UI (Next.js):
  - Redesigned `/` with sections: Top Fold (headline/sub), How it works, Why TeamHR, Security & Reliability, CTA.
  - Mobile-first inline styles; minimal assets for faster LCP.
- SEO:
  - `app/layout.tsx` metadata updated (title, description, Open Graph, Twitter).
- CTA Path:
  - Primary CTA → `/invite`, Secondary → `/onboarding` and GitHub connect.

How to test
1) Open `/` and verify the sections render and links work (`/invite`, `/onboarding`, `/summary`, `/briefing`).
2) View page source or devtools → confirm metadata title/description and OG/Twitter fields.
3) Quick perf sanity: no heavy images; initial render is instant (local dev). LCP should be within target on minimal page.

Security/NFR
- No PII exposed on landing. Minimal client-side JS; no unauthenticated API calls.

