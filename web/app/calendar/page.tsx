"use client";
import { useEffect, useState } from 'react';

type Ev = { id: string; summary?: string; start?: any; end?: any; htmlLink?: string };

export default function CalendarPage() {
  const [next90m, setNext90m] = useState<Ev[]>([]);
  const [upcoming, setUpcoming] = useState<Ev[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/calendar/meetings', { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'failed');
        setNext90m(json.next90m || []);
        setUpcoming(json.upcoming24h || []);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    };
    load();
  }, []);

  const generate = async (m: Ev) => {
    setBusy(m.id);
    try {
      const res = await fetch('/api/briefing/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantId: 't-demo', userId: 'u-demo', meeting: { id: m.id, title: m.summary, start: m.start, end: m.end } }) });
      if (!res.ok) throw new Error('generate_failed');
    } catch (e) { setError(String(e)); } finally { setBusy(null); }
  };

  const Section = ({ title, data }: { title: string; data: Ev[] }) => (
    <section>
      <h3>{title}</h3>
      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
        {data.map((e) => (
          <li key={e.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, display: 'grid', gap: 6 }}>
            <div style={{ fontWeight: 600 }}>{e.summary || '1:1 Meeting'}</div>
            <div style={{ color: '#666' }}>{e.start?.dateTime || e.start?.date} → {e.end?.dateTime || e.end?.date}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {e.htmlLink && <a href={e.htmlLink} target="_blank" rel="noreferrer">Open in Calendar</a>}
              <button onClick={() => generate(e)} disabled={busy === e.id} style={{ padding: '6px 10px', background: '#111', color: '#fff', borderRadius: 6 }}>{busy === e.id ? 'Generating...' : 'Generate Briefing'}</button>
              <a href="/briefing">View Briefings</a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>Calendar — 1:1 Meetings</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <Section title="Next 90 minutes" data={next90m} />
      <Section title="Upcoming 24 hours" data={upcoming} />
    </main>
  );
}

export const metadata = { title: 'Calendar', description: 'Upcoming 1:1s and quick actions' };

