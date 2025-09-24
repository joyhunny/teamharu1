Title: D13 – Landing Page Polish (IA/Copy/SEO)

Summary
- Improves the homepage with clear IA and copy. Adds SEO metadata. Establishes primary CTA to `/invite` and secondary to `/onboarding`.

How To Test
1) Open `/` and verify sections: Top Fold, How it works, Why TeamHR, Security, CTA.
2) Click CTAs to ensure navigation works.
3) Inspect metadata via browser devtools (Elements → head) for title/description/OG/Twitter.

Rollback Plan
- Revert `web/app/page.tsx` and `web/app/layout.tsx` to previous versions.

Notes
- Future: add testimonials, pricing, FAQ, and images with `loading="lazy"`.

