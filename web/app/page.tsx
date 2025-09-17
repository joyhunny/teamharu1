export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <section style={{ display: 'grid', gap: 12, padding: '40px 0' }}>
        <h1 style={{ fontSize: 40, margin: 0 }}>Get 1:1s ready in 10 minutes</h1>
        <p style={{ fontSize: 18, color: '#444', margin: 0 }}>
          TeamHR AI copilot drafts your meeting briefings from your calendar and GitHub activity — securely, per-tenant.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <a href="/invite" style={{ background: '#111', color: 'white', padding: '10px 16px', borderRadius: 6 }}>Get Started</a>
          <a href="/health" style={{ padding: '10px 16px' }}>Check Health</a>
        </div>
      </section>
    </main>
  );
}
