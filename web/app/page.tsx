"use client";
import { useMemo, useState, useEffect } from 'react';

export default function Home({ searchParams }: { searchParams?: { seg?: string } }) {
  // Design tokens from 8.1 媛?대뱶 (approx.)
  const color = {
    primary: '#FFD84D',
    text: '#111',
    subtext: '#4B5563',
    border: '#E5E7EB',
    bg: '#FFFFFF',
  } as const;
  const container: React.CSSProperties = { maxWidth: 1200, margin: '0 auto', padding: '0 24px' };
  const section: React.CSSProperties = { padding: '32px 0' };
  const initialSeg = (searchParams?.seg || 'leaders').toLowerCase();
  const [seg, setSeg] = useState<'leaders' | 'developers'>(initialSeg === 'developers' ? 'developers' : 'leaders');
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('seg', seg);
    window.history.replaceState({}, '', url.toString());
  }, [seg]);

  return (
    <main style={{ background: color.bg, color: color.text }}>
      {/* Header (Sticky) */}
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `1px solid ${color.border}` }}>
        <div style={{ ...container, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" aria-label="TeamHR 홈" style={{ fontWeight: 700, textDecoration: 'none', color: color.text }}>TeamHR</a>
          <nav aria-label="Primary">
            <ul style={{ display: 'flex', gap: 16, listStyle: 'none', margin: 0, padding: 0 }}>
              <li><a href="/summary" style={{ color: color.text }}>요약</a></li>
              <li><a href="/briefing" style={{ color: color.text }}>브리핑</a></li>
              <li><a href="/insights" style={{ color: color.text }}>오늘</a></li>
              <li><a href="/calendar" style={{ color: color.text }}>캘린더</a></li>
              <li><a href="/roadmap" style={{ color: color.text }}>로드맵</a></li>
              <li><a href="/invite" style={{ background: color.text, color: '#fff', padding: '10px 16px', borderRadius: 9999, textDecoration: 'none' }} aria-label="무료 시작">무료 시작</a></li>
            </ul>
          </nav>
        </div>
      </header>

      {/* Hero (Top Fold) */}
      <section style={{ ...section, minHeight: '60vh', display: 'grid', alignItems: 'center' }}>
        <div style={{ ...container, display: 'grid', gap: 16 }}>
          <h1 style={{ fontSize: 56, lineHeight: 1.1, margin: 0 }}>10분 만에 끝내는 1:1 미팅, AI가 준비합니다.</h1>
          <p style={{ fontSize: 18, color: color.subtext, margin: 0 }}>GitHub와 캘린더 신호를 실행 가능한 1:1 브리핑으로 전환합니다. 프라이버시 우선, 테넌트 단위 격리.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <a href="/invite" style={{ background: color.text, color: '#fff', padding: '12px 20px', borderRadius: 9999, textDecoration: 'none' }} aria-label="무료 시작 now">무료 시작</a>
            <a href="/api/github/oauth/start?tenantId=t-demo&userId=u-demo" style={{ padding: '12px 16px', border: `1px solid ${color.border}`, borderRadius: 9999, textDecoration: 'none', color: color.text }}>GitHub 연결</a>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8, color: color.subtext, fontSize: 14 }}>
            <span style={{ display: 'inline-block', background: color.primary, padding: '4px 10px', borderRadius: 9999, color: '#111', fontWeight: 600 }} aria-hidden>Beta</span>
            <span>OAuth 2.0 minimal scopes 쨌 Encrypted in transit/storage</span>
          </div>
          {/* Micro proof metrics */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            <span style={{ border: `1px solid ${color.border}`, borderRadius: 9999, padding: '6px 12px', fontSize: 14 }}>Prep time ??50%</span>
            <span style={{ border: `1px solid ${color.border}`, borderRadius: 9999, padding: '6px 12px', fontSize: 14 }}>Meeting satisfaction ??80%</span>
            <span style={{ border: `1px solid ${color.border}`, borderRadius: 9999, padding: '6px 12px', fontSize: 14 }}>첫 브리핑까지 10분</span>
          </div>
        </div>
      </section>

      {/* Problem ??Solution */}
      <section style={section}>
        <div style={{ ...container, display: 'grid', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>1:1을 느리게 하는 것</h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {['PR/리뷰에 흩어진 신호', '매주 불어나는 준비 시간', '초기에 리스크를 놓침'].map((t) => (
              <div key={t} style={{ border: `1px solid ${color.border}`, borderRadius: 16, padding: 16 }}>{t}</div>
            ))}
          </div>
          <h2 style={{ margin: '24px 0 0', fontSize: 28 }}>TeamHR은 이렇게 돕습니다</h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {['AI 활동 요약', '추천 질문이 포함된 1:1 브리핑', '성장 로드맵 초안'].map((t) => (
              <div key={t} style={{ border: `1px solid ${color.border}`, borderRadius: 16, padding: 16 }}>{t}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Aha! in 3 steps */}
      <section style={section}>
        <div style={{ ...container, display: 'grid', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>Aha! in 3 steps</h2>
          <ol style={{ margin: 0, paddingInlineStart: 20, color: color.subtext }}>
            <li>Connect GitHub (Calendar optional for demo)</li>
            <li>첫 1:1 브리핑 생성</li>
            <li>아젠다 검토 및 공유</li>
          </ol>
        </div>
      </section>

      {/* Segment (Leaders / Developers) */}
      <section style={{ ...section, paddingTop: 0 }}>
        <div style={{ ...container, display: 'grid', gap: 12 }}>
          <div aria-label="대상 세그먼트" style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setSeg('leaders')} style={{ cursor:'pointer', padding: '8px 12px', borderRadius: 9999, border: `2px solid ${color.text}`, background: seg === 'leaders' ? color.text : 'transparent', color: seg === 'leaders' ? '#fff' : color.text }}>리더</button>
            <button onClick={() => setSeg('developers')} style={{ cursor:'pointer', padding: '8px 12px', borderRadius: 9999, border: `2px solid ${color.text}`, background: seg === 'developers' ? color.text : 'transparent', color: seg === 'developers' ? '#fff' : color.text }}>개발자</button>
          </div>
          {seg === 'leaders' ? (
            <p style={{ margin: 0, color: color.subtext }}>Cut prep time and coach better with AI briefings and 성장 로드맵s.</p>
          ) : (
            <p style={{ margin: 0, color: color.subtext }}>Showcase impact and get clearer 1:1s with weekly summaries and goals.</p>
          )}
        </div>
      </section>

      {/* Feature cards (3) */}
      <section style={section}>
        <div style={{ ...container, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>핵심 기능</h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <div style={{ border: `1px solid ${color.border}`, borderRadius: 16, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>AI 활동 요약</h3>
              <p style={{ color: color.subtext }}>Commits/PRs/reviews distilled into a weekly narrative and metrics.</p>
            </div>
            <div style={{ border: `1px solid ${color.border}`, borderRadius: 16, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>1:1 브리핑</h3>
              <p style={{ color: color.subtext }}>Agenda, suggested questions, and private notes.</p>
            </div>
            <div style={{ border: `1px solid ${color.border}`, borderRadius: 16, padding: 20 }}>
              <h3 style={{ marginTop: 0 }}>성장 로드맵</h3>
              <p style={{ color: color.subtext }}>Draft goals from trends; save, approve, and share.</p>
            </div>
          </div>
        </div>
      </section>
      {/* Demo (static svg) */}
      <section style={section}>
        <div style={{ ...container, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>동작 데모</h2>
          <img src="/assets/demo-loop.svg" alt="Weekly activity condenses into a 1:1 브리핑" loading="lazy" width={600} height={340} style={{ maxWidth: '100%', height: 'auto', border: `1px solid ${color.border}`, borderRadius: 12 }} />
        </div>
      </section>

      {/* Trust proof */}
      <section style={section}>
        <div style={{ ...container, display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0 }}>함께하는 팀</h3>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }} aria-label="Customer logos">
            <span style={{ color: color.subtext }}>??Acme</span>
            <span style={{ color: color.subtext }}>??Contoso</span>
            <span style={{ color: color.subtext }}>??Globex</span>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <blockquote style={{ margin: 0, border: `1px solid ${color.border}`, borderRadius: 12, padding: 16, color: color.subtext }}>
              ?쏱rep dropped to minutes; our 1:1s got sharper.????Eng Manager
            </blockquote>
            <blockquote style={{ margin: 0, border: `1px solid ${color.border}`, borderRadius: 12, padding: 16, color: color.subtext }}>
              ?쏻eekly summaries make wins visible.????Staff Engineer
            </blockquote>
          </div>
        </div>
      </section>

      {/* Pricing & ROI */}
      <section style={section}>
        <div style={{ ...container, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>요금제 & ROI</h2>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {[{ name: 'Free (Beta)', price: '$0', features: ['Weekly summary', '1:1 브리핑', 'Roadmap draft'] }, { name: 'Team', price: '$', features: ['All Free', 'Sharing & roles', 'Slack/Email'], highlight: true }, { name: 'Org', price: 'Contact', features: ['SSO', 'Audit & policies', 'Support'] }].map((p) => (
              <div key={p.name} style={{ border: `2px solid ${p.highlight ? color.text : color.border}`, borderRadius: 16, padding: 20, background: p.highlight ? '#FFF' : 'transparent' }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 24, margin: '4px 0 8px' }}>{p.price}</div>
                <ul style={{ margin: 0, paddingInlineStart: 18, color: color.subtext }}>
                  {p.features.map((f) => (<li key={f}>{f}</li>))}
                </ul>
                <div style={{ marginTop: 12 }}>
                  <a href="/invite" style={{ background: color.text, color: '#fff', padding: '10px 16px', borderRadius: 9999, textDecoration: 'none' }}>시작</a>
                </div>
              </div>
            ))}
          </div>
          <p style={{ margin: 0, color: color.subtext, fontSize: 14 }}>Estimate ROI: reduced prep time 횞 hourly rate 횞 headcount ??payback in weeks.</p>
        </div>
      </section>

      {/* FAQ */}
      <section style={section}>
        <div style={{ ...container, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>FAQ</h2>
          <details style={{ border: `1px solid ${color.border}`, borderRadius: 12, padding: 12 }}>
            <summary>GitHub는 어떻게 연결하나요??</summary>
            <p style={{ marginTop: 8, color: color.subtext }}>Use the Connect GitHub button above or visit Summary ??it uses OAuth with minimal scopes.</p>
          </details>
          <details style={{ border: `1px solid ${color.border}`, borderRadius: 12, padding: 12 }}>
            <summary>데이터는 안전한가요??</summary>
            <p style={{ marginTop: 8, color: color.subtext }}>Per-tenant isolation, encrypted in transit and at rest. See Security & Integrations.</p>
          </details>
          <details style={{ border: `1px solid ${color.border}`, borderRadius: 12, padding: 12 }}>
            <summary>What?셲 the fastest way to value?</summary>
            <p style={{ marginTop: 8, color: color.subtext }}>Connect GitHub ??generate first briefing ??review in next 1:1. That?셲 the Aha path.</p>
          </details>
        </div>
      </section>

      {/* Security & Integrations */}
      <section style={section}>
        <div style={{ ...container, display: 'grid', gap: 8, color: color.subtext }}>
          <h3 style={{ margin: 0, color: color.text }}>Security & Integrations</h3>
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            <li>OAuth 2.0 minimal scopes 쨌 per-tenant data isolation</li>
            <li>AWS serverless with CloudWatch SLOs</li>
            <li>GitHub today, Calendar next ??<a href="/integrations">Integrations</a></li>
          </ul>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ ...section, background: color.primary }}>
        <div style={{ ...container, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Ready to change your 1:1s?</div>
            <div style={{ color: '#663c00' }}>Try TeamHR beta ??fast, private, useful.</div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <a href="/invite" style={{ background: '#111', color: '#fff', padding: '12px 20px', borderRadius: 9999, textDecoration: 'none' }} aria-label="무료 시작">무료 시작</a>
            <a href="/onboarding" style={{ padding: '12px 16px', border: '1px solid #111', borderRadius: 9999, textDecoration: 'none', color: '#111' }}>See Setup</a>
          </div>
        </div>
      </section>
    </main>
  );
}







